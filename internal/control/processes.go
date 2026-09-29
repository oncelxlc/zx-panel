package control

import (
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// processScanMu 合并所有浏览器的五秒扫描，避免同时触发多份 procfs 遍历。
// ponytail: 单实例全局扫描锁；多服务器支持不在首发范围。
var processScanMu sync.Mutex

// Processes 返回最多二百项的共享只读快照。
// 名称搜索不会读取参数、环境变量或向进程发送信号。
func (c *Collector) Processes(search, sortBy, cursor string, limit int) (Page[Process], error) {
	result := Page[Process]{Items: []Process{}}
	if len(search) > 200 {
		return result, Fail(422, "INVALID_INPUT", "搜索内容过长")
	}
	if sortBy != "" && sortBy != "cpu" && sortBy != "memory" && sortBy != "pid" {
		return result, Fail(422, "INVALID_INPUT", "进程排序无效")
	}
	if limit < 1 || limit > 200 {
		return result, Fail(422, "INVALID_INPUT", "分页数量无效")
	}
	offset, err := Offset(cursor)
	if err != nil {
		return result, err
	}
	processScanMu.Lock()
	defer processScanMu.Unlock()
	now := time.Now()
	if c.processAt.IsZero() || now.Sub(c.processAt) >= 5*time.Second {
		info := c.Info()
		items, current, err := sampleProcesses(info.BootID, info.BootedAt)
		if err != nil {
			return result, Fail(503, "CAPABILITY_UNAVAILABLE", "无法读取 Linux 进程快照")
		}
		elapsed := now.Sub(c.processAt).Seconds()
		if !c.processAt.IsZero() && elapsed > 0 && elapsed < 30 {
			for i := range items {
				key := items[i].ProcessKey
				if before, ok := c.processPrev[key]; ok && current[key] >= before {
					usage := 100 * (current[key] - before) / elapsed
					items[i].CPUPercent = &usage
				}
			}
		}
		c.processes = items
		c.processPrev = current
		c.processAt = now
	}
	filtered := make([]Process, 0, len(c.processes))
	for _, p := range c.processes {
		if strings.Contains(strings.ToLower(p.Name), strings.ToLower(search)) || strings.Contains(strconv.Itoa(p.PID), search) {
			filtered = append(filtered, p)
		}
	}
	sort.Slice(filtered, func(i, j int) bool {
		a, b := filtered[i], filtered[j]
		if sortBy == "cpu" {
			if a.CPUPercent != nil && b.CPUPercent != nil && *a.CPUPercent != *b.CPUPercent {
				return *a.CPUPercent > *b.CPUPercent
			}
			if (a.CPUPercent != nil) != (b.CPUPercent != nil) {
				return a.CPUPercent != nil
			}
		}
		if sortBy == "memory" {
			if a.RSSBytes != nil && b.RSSBytes != nil && *a.RSSBytes != *b.RSSBytes {
				return *a.RSSBytes > *b.RSSBytes
			}
			if (a.RSSBytes != nil) != (b.RSSBytes != nil) {
				return a.RSSBytes != nil
			}
		}
		return a.PID < b.PID
	})
	if offset >= len(filtered) {
		return result, nil
	}
	return paginate(filtered[offset:min(offset+limit+1, len(filtered))], limit, offset), nil
}
