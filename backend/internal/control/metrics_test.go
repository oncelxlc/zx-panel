package control

import (
	"context"
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
