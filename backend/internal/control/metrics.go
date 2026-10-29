package control

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"zx-panel/internal/config"
)

// cpuCounter 保存 Linux CPU 前八项累计计数，不重复加入 guest。
// 使用 uint64 以便检测回退而不是掩盖异常。
type cpuCounter struct{ Total, Idle, Wait uint64 }

// ioCounter 保留两个方向的累计字节。
// 同一设备重置后重新建立差分基线。
type ioCounter struct{ Read, Write uint64 }

// rawSample 只在采集器内部使用，差分基于实际单调时间。
// 公共 API 不直接序列化原始内核数据。
type rawSample struct {
	At       time.Time
	BootID   string
	CPU      []cpuCounter
	Memory   Memory
	Load     *LoadAverage
	Networks map[string]ioCounter
	Disks    map[string]ioCounter
	Primary  string
	Uptime   float64
}

// Collector 对所有请求共享一次采集、有限历史和短时进程快照。
// mu 保护快照发布，不在持锁期间读文件或访问数据库。
type Collector struct {
	mu           sync.RWMutex
	cfg          config.PanelConfig
	latest       Snapshot
	info         SystemInfo
	ring         []Snapshot
	previous     rawSample
	filesystems  []Filesystem
	filesystemAt time.Time
	processes    []Process
	processAt    time.Time
	processPrev  map[string]float64
}

// NewCollector 初始化明确不可用的快照，不用零值冒充采样。
// 首次读取成功后 CPU 与速率仍需等待第二个样本。
func NewCollector(cfg config.PanelConfig) *Collector {
	return &Collector{cfg: cfg, latest: Snapshot{SampledAt: time.Now().UTC(), CPUUsagePercent: Missing("warming-up", "FIRST_SAMPLE"), CPUPerCorePercent: []Value{}, Memory: Memory{UsagePercent: Missing("unavailable", "NO_SAMPLE")}, Filesystems: []Filesystem{}, BlockDevices: []BlockDevice{}, Networks: []Network{}}, processPrev: map[string]float64{}}
}

// Snapshot 返回只读快照，切片在发布之后不再变更。
// API 与 SSE 不触发额外采样。
func (c *Collector) Snapshot() Snapshot { c.mu.RLock(); defer c.mu.RUnlock(); return c.latest }

// Info 返回本机基础信息并更新单调运行时长。
// 信息缺失时保留平台返回的不可用表示。
func (c *Collector) Info() SystemInfo { c.mu.RLock(); defer c.mu.RUnlock(); return c.info }

// Collect 在锁外采集，随后一次发布一致快照。
// 采集失败仍更新时间和不可用质量，不延用旧值伪装实时。
func (c *Collector) Collect() Snapshot {
	raw, info, err := samplePlatform(c.cfg)
	now := time.Now()
	if raw.At.IsZero() {
		raw.At = now
	}
	previous := c.previous
	seconds := raw.At.Sub(previous.At).Seconds()
	fresh := !previous.At.IsZero() && previous.BootID == raw.BootID && seconds > 0 && seconds < 30
	snapshot := Snapshot{SampledAt: raw.At.UTC(), BootID: raw.BootID, IntervalMS: int64(seconds * 1000), CPUUsagePercent: Missing("warming-up", "FIRST_SAMPLE"), CPUPerCorePercent: []Value{}, Memory: raw.Memory, LoadAverage: raw.Load, Filesystems: []Filesystem{}, Networks: []Network{}, BlockDevices: []BlockDevice{}}
	if previous.At.IsZero() {
		snapshot.IntervalMS = 0
	}
	if err != nil {
		snapshot.CPUUsagePercent = Missing("unavailable", "COLLECTOR_UNAVAILABLE")
	}
	if len(raw.CPU) > 0 {
		for i, cur := range raw.CPU {
			value := Missing("warming-up", "COUNTER_RESET")
			if fresh && len(previous.CPU) == len(raw.CPU) {
				value = cpuDelta(previous.CPU[i], cur)
			}
			if i == 0 {
				snapshot.CPUUsagePercent = value
			} else {
				snapshot.CPUPerCorePercent = append(snapshot.CPUPerCorePercent, value)
			}
		}
	}
	for name, current := range raw.Networks {
		old, exists := previous.Networks[name]
		rx, tx := counterRates(old, current, seconds, fresh && exists)
		read, write := strconv.FormatUint(current.Read, 10), strconv.FormatUint(current.Write, 10)
		snapshot.Networks = append(snapshot.Networks, Network{ID: "net:" + name, Name: name, IsPrimary: name == raw.Primary, RXBytesPerSecond: rx, TXBytesPerSecond: tx, RXTotalBytes: &read, TXTotalBytes: &write})
	}
	sort.Slice(snapshot.Networks, func(i, j int) bool { return snapshot.Networks[i].Name < snapshot.Networks[j].Name })
	for name, current := range raw.Disks {
		old, exists := previous.Disks[name]
		read, write := counterRates(old, current, seconds, fresh && exists)
		snapshot.BlockDevices = append(snapshot.BlockDevices, BlockDevice{ID: "disk:" + name, Name: name, ReadBytesPerSecond: read, WriteBytesPerSecond: write})
	}
	sort.Slice(snapshot.BlockDevices, func(i, j int) bool { return snapshot.BlockDevices[i].Name < snapshot.BlockDevices[j].Name })
	if c.filesystemAt.IsZero() || now.Sub(c.filesystemAt) >= 15*time.Second {
		c.filesystems = sampleFilesystems()
		c.filesystemAt = now
	}
	snapshot.Filesystems = c.filesystems
	c.previous = raw
	c.mu.Lock()
	snapshot.Sequence = c.latest.Sequence + 1
	c.latest = snapshot
	c.info = info
	c.ring = append(c.ring, snapshot)
	if len(c.ring) > 450 {
		c.ring[0] = Snapshot{}
		c.ring = c.ring[1:]
	}
	c.mu.Unlock()
	return snapshot
}

// cpuDelta 严格实现不含 iowait 的总 CPU 使用率。
// 回退、热插拔和无有效差分都返回缺口。
func cpuDelta(previous, current cpuCounter) Value {
	if current.Total <= previous.Total || current.Idle < previous.Idle || current.Wait < previous.Wait {
		return Missing("warming-up", "COUNTER_RESET")
	}
	total := current.Total - previous.Total
	idle := current.Idle - previous.Idle
	wait := current.Wait - previous.Wait
	if idle > total || wait > total-idle {
		return Missing("unavailable", "COUNTER_INVALID")
	}
	return Number(100 * float64(total-idle-wait) / float64(total))
}

// counterRates 以实际间隔求速率，设备重置不产生负速率。
// 不以固定两秒替代单调时钟。
func counterRates(previous, current ioCounter, seconds float64, valid bool) (Value, Value) {
	if !valid || seconds <= 0 || current.Read < previous.Read || current.Write < previous.Write {
		return Missing("warming-up", "COUNTER_RESET"), Missing("warming-up", "COUNTER_RESET")
	}
	return Number(float64(current.Read-previous.Read) / seconds), Number(float64(current.Write-previous.Write) / seconds)
}

// metricValues 将快照映射为允许的历史序列。
// key 的第二段为设备 ID，不能接受任意文件路径。
func metricValues(s Snapshot) map[string]Value {
	values := map[string]Value{"cpu|": s.CPUUsagePercent, "memory|": s.Memory.UsagePercent}
	for i, value := range s.CPUPerCorePercent {
		values[fmt.Sprintf("cpu.%d|", i)] = value
	}
	if s.LoadAverage != nil {
		values["load.one|"] = Number(s.LoadAverage.One)
		values["load.five|"] = Number(s.LoadAverage.Five)
		values["load.fifteen|"] = Number(s.LoadAverage.Fifteen)
	}
	for _, fs := range s.Filesystems {
		values["disk|"+fs.ID] = fs.UsagePercent
	}
	for _, device := range s.BlockDevices {
		values["disk.read|"+device.ID] = device.ReadBytesPerSecond
		values["disk.write|"+device.ID] = device.WriteBytesPerSecond
	}
	for _, network := range s.Networks {
		values["network|"+network.ID] = network.RXBytesPerSecond
		values["network.tx|"+network.ID] = network.TXBytesPerSecond
	}
	return values
}

// aggregate 保存样本数量、平均和峰值，null 不进入分母。
// 一段全部不可用的序列返回显式缺口。
func aggregate(at time.Time, values []Value) HistoryPoint {
	point := HistoryPoint{At: at}
	sum, min, max := 0.0, math.Inf(1), math.Inf(-1)
	for _, v := range values {
		if v.Quality != "ok" || v.Value == nil || math.IsNaN(*v.Value) || math.IsInf(*v.Value, 0) {
			continue
		}
		n := *v.Value
		sum += n
		min = math.Min(min, n)
		max = math.Max(max, n)
		point.SampleCount++
	}
	if point.SampleCount > 0 {
		avg := sum / float64(point.SampleCount)
		point.Avg = &avg
		point.Min = &min
		point.Max = &max
	}
	return point
}

// PersistAggregate 每十秒保存聚合，不逐点写入原始采样。
// 数据库故障由调用者记录，内存采集仍然继续。
func (c *Collector) PersistAggregate(ctx context.Context, r *Repository) error {
	c.mu.RLock()
	samples := append([]Snapshot(nil), c.ring...)
	c.mu.RUnlock()
	if len(samples) == 0 {
		return nil
	}
	end := samples[len(samples)-1].SampledAt.Truncate(10 * time.Second)
	start := end.Add(-10 * time.Second)
	groups := map[string][]Value{}
	for _, sample := range samples {
		if sample.SampledAt.Before(start) || !sample.SampledAt.Before(end) {
			continue
		}
		for key, value := range metricValues(sample) {
			groups[key] = append(groups[key], value)
		}
	}
	tx, err := r.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	for key, values := range groups {
		parts := strings.SplitN(key, "|", 2)
		point := aggregate(start, values)
		if _, err = tx.Exec(ctx, "INSERT INTO app.metrics_aggregates(metric,device_id,at,avg,min,max,sample_count) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING", parts[0], parts[1], point.At, point.Avg, point.Min, point.Max, point.SampleCount); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// History 读取最多六百个点，长时间范围按峰值保留方式聚合。
// 请求单位和设备选择仅限采集器允许的指标。
func (c *Collector) History(ctx context.Context, r *Repository, metric, device string, from, to time.Time, step int) (History, error) {
	result := History{Metric: metric, Unit: "percent", StepSeconds: step, Points: []HistoryPoint{}}
	if device != "" {
		result.DeviceID = &device
	}
	if strings.HasPrefix(metric, "network") || strings.HasPrefix(metric, "disk.") {
		result.Unit = "bytes-per-second"
	}
	if strings.HasPrefix(metric, "load.") {
		result.Unit = "load"
	}
	allowed := metric == "cpu" || metric == "memory" || metric == "disk" || metric == "network" || metric == "network.tx" || metric == "disk.read" || metric == "disk.write" || metric == "load.one" || metric == "load.five" || metric == "load.fifteen"
	if strings.HasPrefix(metric, "cpu.") {
		n, err := strconv.Atoi(strings.TrimPrefix(metric, "cpu."))
		allowed = err == nil && n >= 0 && n < 4096
	}
	if !allowed || step < 2 || step > 3600 || !from.Before(to) || to.Sub(from) > 24*time.Hour+time.Second || to.Sub(from).Seconds()/float64(step) > 600 {
		return result, Fail(422, "INVALID_INPUT", "历史指标、范围或点数无效")
	}
	if step < 10 && to.Sub(from) <= 15*time.Minute {
		c.mu.RLock()
		samples := append([]Snapshot(nil), c.ring...)
		c.mu.RUnlock()
		for _, sample := range samples {
			if sample.SampledAt.Before(from) || sample.SampledAt.After(to) {
				continue
			}
			value, ok := metricValues(sample)[metric+"|"+device]
			if !ok {
				continue
			}
			point := aggregate(sample.SampledAt, []Value{value})
			result.Points = append(result.Points, point)
			if result.AvailableFrom == nil {
				at := sample.SampledAt
				result.AvailableFrom = &at
			}
		}
		return historyGaps(result, from, to), nil
	}
	rows, err := r.DB.Query(ctx, `SELECT to_timestamp(floor(extract(epoch FROM at)/$5)*$5),sum(avg*sample_count)/NULLIF(sum(sample_count),0),min(min),max(max),sum(sample_count)::int FROM app.metrics_aggregates WHERE metric=$1 AND device_id=$2 AND at >= $3 AND at <= $4 GROUP BY 1 ORDER BY 1 LIMIT 600`, metric, device, from, to, step)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var point HistoryPoint
		if err = rows.Scan(&point.At, &point.Avg, &point.Min, &point.Max, &point.SampleCount); err != nil {
			return result, err
		}
		point.At = point.At.UTC()
		result.Points = append(result.Points, point)
		if result.AvailableFrom == nil {
			at := point.At
			result.AvailableFrom = &at
		}
	}
	return historyGaps(result, from, to), rows.Err()
}

// historyGaps 将没有观测的时间桶明确标为 null，图表不能跨断流连线。
// 只补空桶，不推测或插值缺失指标；保持六百点上限。
func historyGaps(history History, from, to time.Time) History {
	step := time.Duration(history.StepSeconds) * time.Second
	groups := map[int64][]HistoryPoint{}
	for _, point := range history.Points {
		bucket := point.At.Truncate(step).UnixNano()
		groups[bucket] = append(groups[bucket], point)
	}
	history.Points = []HistoryPoint{}
	for at := from.Truncate(step); at.Before(to) && len(history.Points) < 600; at = at.Add(step) {
		point := HistoryPoint{At: at.UTC()}
		sum := 0.0
		minimum, maximum := math.Inf(1), math.Inf(-1)
		for _, sample := range groups[at.UnixNano()] {
			if sample.SampleCount < 1 || sample.Avg == nil || sample.Min == nil || sample.Max == nil {
				continue
			}
			sum += *sample.Avg * float64(sample.SampleCount)
			point.SampleCount += sample.SampleCount
			minimum = math.Min(minimum, *sample.Min)
			maximum = math.Max(maximum, *sample.Max)
		}
		if point.SampleCount > 0 {
			avg := sum / float64(point.SampleCount)
			point.Avg = &avg
			point.Min = &minimum
			point.Max = &maximum
		}
		history.Points = append(history.Points, point)
	}
	return history
}
