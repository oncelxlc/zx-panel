package control

import (
	"errors"
	"strconv"
	"strings"
)

// parseCPU 只累计前八个 CPU 计数，忽略重复包含的 guest。
// 任意字段异常会使该次 CPU 采集整体不可用。
func parseCPU(text string) ([]cpuCounter, error) {
	result := []cpuCounter{}
	for _, line := range strings.Split(text, "\n") {
		fields := strings.Fields(line)
		if len(fields) == 0 || !strings.HasPrefix(fields[0], "cpu") {
			continue
		}
		if len(fields) < 9 {
			return nil, errors.New("incomplete CPU counters")
		}
		var counter cpuCounter
		for i := 1; i <= 8; i++ {
			v, err := strconv.ParseUint(fields[i], 10, 64)
			if err != nil || counter.Total+v < counter.Total {
				return nil, errors.New("invalid CPU counter")
			}
			counter.Total += v
			if i == 4 {
				counter.Idle = v
			}
			if i == 5 {
				counter.Wait = v
			}
		}
		result = append(result, counter)
	}
	if len(result) == 0 {
		return nil, errors.New("no CPU counters")
	}
	return result, nil
}

// parseMemory 明确使用 MemAvailable，缺少该字段不回退到 MemFree。
// 缓存与 swap 单独展示，不重复加入已用内存。
func parseMemory(text string) Memory {
	values := map[string]uint64{}
	for _, line := range strings.Split(text, "\n") {
		fields := strings.Fields(line)
		if len(fields) != 3 || fields[2] != "kB" {
			continue
		}
		value, err := strconv.ParseUint(fields[1], 10, 64)
		if err == nil && value < 1<<54 {
			values[strings.TrimSuffix(fields[0], ":")] = value * 1024
		}
	}
	memory := Memory{UsagePercent: Missing("unavailable", "MEM_AVAILABLE_MISSING")}
	if total, ok := values["MemTotal"]; ok && total > 0 {
		memory.TotalBytes = &total
		if available, ok := values["MemAvailable"]; ok && available <= total {
			used := total - available
			memory.AvailableBytes = &available
			memory.UsedBytes = &used
			memory.UsagePercent = Number(100 * float64(used) / float64(total))
		}
	}
	if cached, ok := values["Cached"]; ok {
		memory.CachedBytes = &cached
	}
	if total, ok := values["SwapTotal"]; ok {
		memory.SwapTotalBytes = &total
		if free, ok := values["SwapFree"]; ok && free <= total {
			used := total - free
			memory.SwapUsedBytes = &used
		}
	}
	return memory
}
