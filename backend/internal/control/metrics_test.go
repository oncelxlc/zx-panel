package control

import (
	"context"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"
)

// TestMetricMath 锁定文档中的 CPU、吞吐及聚合口径。
// 缺口不得变成零、guest 不重复计数，实际间隔参与速率。
func TestMetricMath(t *testing.T) {
	cpu, err := parseCPU("cpu 100 20 30 200 10 5 5 30 50 5\ncpu0 10 2 3 20 1 1 1 3 5 1\n")
	if err != nil || cpu[0].Total != 400 {
		t.Fatalf("CPU parse: %#v %v", cpu, err)
	}
	v := cpuDelta(cpuCounter{Total: 100, Idle: 10, Wait: 10}, cpuCounter{Total: 200, Idle: 40, Wait: 30})
	if v.Value == nil || *v.Value != 50 {
		t.Fatal(v)
	}
	if cpuDelta(cpu[0], cpu[0]).Value != nil {
		t.Fatal("zero delta must be missing")
	}
	rx, tx := counterRates(ioCounter{100, 200}, ioCounter{250, 500}, 3, true)
	if rx.Value == nil || *rx.Value != 50 || *tx.Value != 100 {
		t.Fatal(rx, tx)
	}
	m := parseMemory("MemTotal: 1000 kB\nMemAvailable: 400 kB\nMemFree: 50 kB\nCached: 100 kB\nSwapTotal: 0 kB\nSwapFree: 0 kB\n")
	if m.UsedBytes == nil || *m.UsedBytes != 600*1024 || *m.UsagePercent.Value != 60 || *m.SwapUsedBytes != 0 {
		t.Fatal(m)
	}
	if parseMemory("MemTotal: 1000 kB\nMemFree: 400 kB\n").UsagePercent.Value != nil {
		t.Fatal("MemFree fallback forbidden")
	}
	point := aggregate(time.Now(), []Value{Number(0), Missing("warming-up", "FIRST_SAMPLE"), Number(10)})
	if point.SampleCount != 2 || *point.Avg != 5 || *point.Min != 0 || *point.Max != 10 {
		t.Fatal(point)
	}
}

// TestRevokedStreamDiscardsBufferedEvents 覆盖注销后已有缓冲仍可泄露的问题。
// 撤销优先于已经排队的业务事件。
func TestRevokedStreamDiscardsBufferedEvents(t *testing.T) {
	hub, _ := NewEventHub()
	sub, _, _, _ := hub.Subscribe("", 1)
	_ = hub.Publish("app.changed", map[string]string{"id": "secret-app"})
	hub.Revoke(1)
	if _, ok := sub.Next(context.Background()); ok {
		t.Fatal("revoked stream delivered a buffered event")
	}
}

// TestMetricValueMatchesFullMapping 锁定直接查询与完整指标映射的等价性。
// 覆盖缺失质量、设备重复、负载缺失和非规范 CPU 名称，避免改变历史缺口。
func TestMetricValueMatchesFullMapping(t *testing.T) {
	sample := Snapshot{
		CPUUsagePercent:   Number(10),
		CPUPerCorePercent: []Value{Number(20), Missing("warming-up", "COUNTER_RESET")},
		Memory:            Memory{UsagePercent: Number(30)},
		LoadAverage:       &LoadAverage{One: 1, Five: 2, Fifteen: 3},
		Filesystems:       []Filesystem{{ID: "fs:root", UsagePercent: Number(40)}, {ID: "fs:root", UsagePercent: Number(50)}},
		BlockDevices:      []BlockDevice{{ID: "disk:sda", ReadBytesPerSecond: Number(60), WriteBytesPerSecond: Number(70)}, {ID: "disk:sda", ReadBytesPerSecond: Number(80), WriteBytesPerSecond: Missing("unavailable", "NO_SAMPLE")}},
		Networks:          []Network{{ID: "net:eth0", RXBytesPerSecond: Number(90), TXBytesPerSecond: Number(100)}, {ID: "net:eth0", RXBytesPerSecond: Number(110), TXBytesPerSecond: Number(120)}},
	}
	queries := []string{"cpu.00|", "cpu.+1|", "cpu.-1|", "cpu.2|", "cpu.999999999999999999999|", "cpu.invalid|", "cpu|wrong", "memory|wrong", "load.one|wrong", "disk|", "disk|unknown", "disk.read|unknown", "disk.write|unknown", "network|unknown", "network.tx|unknown", "unknown|"}
	for key := range metricValues(sample) {
		queries = append(queries, key)
	}
	for _, snapshot := range []Snapshot{sample, {}} {
		values := metricValues(snapshot)
		for _, key := range queries {
			metric, device, _ := strings.Cut(key, "|")
			got, exists := metricValue(snapshot, metric, device)
			want, wantExists := values[key]
			if exists != wantExists || !reflect.DeepEqual(got, want) {
				t.Fatalf("%s: got %#v/%v, want %#v/%v", key, got, exists, want, wantExists)
			}
		}
	}
}

// TestHistoryMetricSelection 保持原始窗口的样本时间、质量和空桶结果。
// 对照完整映射生成预期结果，不接触持久化历史或实际采集器。
func TestHistoryMetricSelection(t *testing.T) {
	start := time.Unix(1700000000, 0).UTC()
	c := &Collector{ring: []Snapshot{
		{SampledAt: start.Add(-2 * time.Second), CPUUsagePercent: Number(99)},
		{SampledAt: start, CPUUsagePercent: Number(10), CPUPerCorePercent: []Value{Number(20)}, LoadAverage: &LoadAverage{One: 1}},
		{SampledAt: start.Add(2 * time.Second), CPUUsagePercent: Missing("warming-up", "COUNTER_RESET"), Networks: []Network{{ID: "net:eth0", TXBytesPerSecond: Number(30)}}},
		{SampledAt: start.Add(6 * time.Second), CPUUsagePercent: Number(40)},
		{SampledAt: start.Add(10 * time.Second), CPUUsagePercent: Number(99)},
	}}
	end := start.Add(8 * time.Second)
	for _, query := range []struct{ metric, device, unit string }{{"cpu", "", "percent"}, {"cpu.0", "", "percent"}, {"cpu.00", "", "percent"}, {"cpu", "wrong", "percent"}, {"load.one", "", "load"}, {"network.tx", "net:eth0", "bytes-per-second"}} {
		got, err := c.History(context.Background(), nil, query.metric, query.device, start, end, 2)
		if err != nil {
			t.Fatal(err)
		}
		want := History{Metric: query.metric, Unit: query.unit, StepSeconds: 2, Points: []HistoryPoint{}}
		if query.device != "" {
			want.DeviceID = &query.device
		}
		for _, sample := range c.ring {
			if sample.SampledAt.Before(start) || sample.SampledAt.After(end) {
				continue
			}
			if value, ok := metricValues(sample)[query.metric+"|"+query.device]; ok {
				want.Points = append(want.Points, aggregate(sample.SampledAt, []Value{value}))
				if want.AvailableFrom == nil {
					at := sample.SampledAt
					want.AvailableFrom = &at
				}
			}
		}
		want = historyGaps(want, start, end)
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("%s/%s: got %#v, want %#v", query.metric, query.device, got, want)
		}
	}
}

// BenchmarkCollectorHistory 测量满十五分钟窗口的单指标读取成本。
// 固定内存样本避免访问主机采集器、数据库或服务。
func BenchmarkCollectorHistory(b *testing.B) {
	start := time.Unix(1700000000, 0).UTC()
	sample := Snapshot{CPUUsagePercent: Number(25), Memory: Memory{UsagePercent: Number(50)}, LoadAverage: &LoadAverage{One: 1, Five: 2, Fifteen: 3}}
	for i := 0; i < 64; i++ {
		sample.CPUPerCorePercent = append(sample.CPUPerCorePercent, Number(float64(i)))
	}
	for i := 0; i < 4; i++ {
		id := strconv.Itoa(i)
		sample.Filesystems = append(sample.Filesystems, Filesystem{ID: "fs:" + id, UsagePercent: Number(40)})
		sample.BlockDevices = append(sample.BlockDevices, BlockDevice{ID: "disk:" + id, ReadBytesPerSecond: Number(100), WriteBytesPerSecond: Number(200)})
		sample.Networks = append(sample.Networks, Network{ID: "net:" + id, RXBytesPerSecond: Number(300), TXBytesPerSecond: Number(400)})
	}
	c := &Collector{}
	for i := 0; i < 450; i++ {
		sample.SampledAt = start.Add(time.Duration(i*2) * time.Second)
		c.ring = append(c.ring, sample)
	}
	for _, query := range []struct{ metric, device string }{{"cpu", ""}, {"cpu.63", ""}, {"network.tx", "net:3"}} {
		b.Run(query.metric, func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				history, err := c.History(context.Background(), nil, query.metric, query.device, start, start.Add(15*time.Minute), 2)
				if err != nil || len(history.Points) != 450 {
					b.Fatalf("history points=%d error=%v", len(history.Points), err)
				}
			}
		})
	}
}
