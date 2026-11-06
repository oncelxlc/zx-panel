//go:build linux

package control

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/sys/unix"
	"zx-panel/internal/config"
)

// linuxMetadata 对主机静态字段使用一分钟缓存。
// 瞬时指标不会因为该缓存丢失实际采样时间。
var linuxMetadata struct {
	sync.Mutex
	at   time.Time
	info SystemInfo
}

// clockTicks 通过固定系统工具读取进程计数单位，失败时拒绝伪造 CPU。
// 命令只运行一次，不接收用户输入。
var clockTicks = sync.OnceValue(func() float64 {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "/usr/bin/getconf", "CLK_TCK").Output()
	if err != nil {
		return 0
	}
	n, err := strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
	if err != nil || n <= 0 {
		return 0
	}
	return n
})

// readSmall 限制内核伪文件读取体积，避免异常挂载无限分配。
// 读取失败由字段质量或能力探测处理。
func readSmall(path string) string {
	file, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 4096), 1<<20)
	var out strings.Builder
	for scanner.Scan() {
		if out.Len()+len(scanner.Bytes()) > 4<<20 {
			return ""
		}
		out.WriteString(scanner.Text())
		out.WriteByte('\n')
	}
	if scanner.Err() != nil {
		return ""
	}
	return out.String()
}

// samplePlatform 从 procfs 采样，不启动 top 或 free 子进程。
// 差分计算交给共享 Collector，内核计数始终使用整数。
func samplePlatform(cfg config.PanelConfig) (rawSample, SystemInfo, error) {
	raw := rawSample{At: time.Now(), BootID: strings.TrimSpace(readSmall("/proc/sys/kernel/random/boot_id")), Memory: parseMemory(readSmall("/proc/meminfo")), Networks: map[string]ioCounter{}, Disks: map[string]ioCounter{}}
	var err error
	raw.CPU, err = parseCPU(readSmall("/proc/stat"))
	uptime := strings.Fields(readSmall("/proc/uptime"))
	if len(uptime) > 0 {
		raw.Uptime, _ = strconv.ParseFloat(uptime[0], 64)
	}
	load := strings.Fields(readSmall("/proc/loadavg"))
	if len(load) >= 3 {
		one, e1 := strconv.ParseFloat(load[0], 64)
		five, e2 := strconv.ParseFloat(load[1], 64)
		fifteen, e3 := strconv.ParseFloat(load[2], 64)
		if e1 == nil && e2 == nil && e3 == nil {
			raw.Load = &LoadAverage{one, five, fifteen}
		}
	}
	for _, line := range strings.Split(readSmall("/proc/net/dev"), "\n") {
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		f := strings.Fields(parts[1])
		if len(f) < 16 {
			continue
		}
		rx, e1 := strconv.ParseUint(f[0], 10, 64)
		tx, e2 := strconv.ParseUint(f[8], 10, 64)
		if e1 == nil && e2 == nil {
			raw.Networks[strings.TrimSpace(parts[0])] = ioCounter{rx, tx}
		}
	}
	best := uint64(^uint64(0))
	for _, line := range strings.Split(readSmall("/proc/net/route"), "\n") {
		f := strings.Fields(line)
		if len(f) < 8 || f[1] != "00000000" {
			continue
		}
		metric, e := strconv.ParseUint(f[6], 10, 64)
		flags, _ := strconv.ParseUint(f[3], 16, 64)
		if e == nil && flags&1 != 0 && metric < best {
			raw.Primary = f[0]
			best = metric
		}
	}
	for _, line := range strings.Split(readSmall("/proc/diskstats"), "\n") {
		f := strings.Fields(line)
		if len(f) < 14 {
			continue
		}
		if _, e := os.Stat(filepath.Join("/sys/block", f[2])); e != nil {
			continue
		}
		if strings.HasPrefix(f[2], "loop") || strings.HasPrefix(f[2], "ram") {
			continue
		}
		read, e1 := strconv.ParseUint(f[5], 10, 64)
		write, e2 := strconv.ParseUint(f[9], 10, 64)
		if e1 == nil && e2 == nil && read < 1<<55 && write < 1<<55 {
			raw.Disks[f[2]] = ioCounter{read * 512, write * 512}
		}
	}
	info := linuxInfo(cfg)
	info.BootID = raw.BootID
	info.MemoryTotalBytes = raw.Memory.TotalBytes
	if raw.Uptime >= 0 && len(uptime) > 0 {
		up := raw.Uptime
		boot := raw.At.Add(-time.Duration(up * float64(time.Second))).UTC()
		info.UptimeSeconds = &up
		info.BootedAt = &boot
	}
	return raw, info, err
}

// linuxInfo 缓存静态系统信息和明确的受限运行范围。
// 容器及非 systemd 环境不会获得主机管理能力。
func linuxInfo(cfg config.PanelConfig) SystemInfo {
	linuxMetadata.Lock()
	defer linuxMetadata.Unlock()
	if time.Since(linuxMetadata.at) < time.Minute {
		return linuxMetadata.info
	}
	hostname, _ := os.Hostname()
	info := SystemInfo{Hostname: hostname, OS: OSInfo{Name: "Linux", Kernel: strings.TrimSpace(readSmall("/proc/sys/kernel/osrelease"))}, Architecture: runtime.GOARCH, LogicalCPUCount: runtime.NumCPU(), ObservationScope: "host", AppSupervisor: "none", ServerTimezone: time.Local.String(), RuntimeRoot: cfg.Paths.RuntimeRoot, AppRoots: cfg.Paths.AppRoots, ServiceAccounts: cfg.Helper.ServiceAccounts}
	if info.ServerTimezone == "Local" {
		zone := strings.TrimSpace(readSmall("/etc/timezone"))
		if _, err := time.LoadLocation(zone); err == nil && zone != "" {
			info.ServerTimezone = zone
		} else {
			info.ServerTimezone = "UTC"
		}
	}
	for _, line := range strings.Split(readSmall("/etc/os-release"), "\n") {
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		value = strings.Trim(value, "\"")
		if key == "NAME" {
			info.OS.Name = value
		}
		if key == "VERSION_ID" {
			info.OS.Version = value
		}
	}
	for _, line := range strings.Split(readSmall("/proc/cpuinfo"), "\n") {
		key, value, ok := strings.Cut(line, ":")
		if ok && (strings.TrimSpace(key) == "model name" || strings.TrimSpace(key) == "Hardware") {
			model := strings.TrimSpace(value)
			info.CPUModel = &model
			break
		}
	}
	if _, err := os.Stat("/.dockerenv"); err == nil {
		info.ObservationScope = "container"
	}
	if _, err := os.Stat("/run/.containerenv"); err == nil {
		info.ObservationScope = "container"
	}
	if strings.Contains(readSmall("/proc/1/cgroup"), "docker") || strings.Contains(readSmall("/proc/1/environ"), "container=") {
		info.ObservationScope = "container"
	}
	if _, err := os.Stat("/run/systemd/system"); err == nil && info.ObservationScope == "host" {
		info.AppSupervisor = "systemd"
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if out, err := exec.CommandContext(ctx, "/usr/bin/getconf", "GNU_LIBC_VERSION").Output(); err == nil {
		fields := strings.Fields(string(out))
		if len(fields) == 2 && fields[0] == "glibc" {
			version := fields[1]
			info.Libc = &LibcInfo{Family: "glibc", Version: &version}
		}
	}
	linuxMetadata.info = info
	linuxMetadata.at = time.Now()
	return info
}

// sampleFilesystems 逐挂载点读取 statfs，不把分区和设备容量相加。
// 只显示持久文件系统与根挂载，保留 reserved blocks 口径差异。
func sampleFilesystems() []Filesystem {
	result := []Filesystem{}
	seen := map[string]bool{}
	for _, line := range strings.Split(readSmall("/proc/self/mountinfo"), "\n") {
		parts := strings.SplitN(line, " - ", 2)
		if len(parts) != 2 {
			continue
		}
		left, right := strings.Fields(parts[0]), strings.Fields(parts[1])
		if len(left) < 6 || len(right) < 2 {
			continue
		}
		mount := strings.NewReplacer("\\040", " ", "\\011", "\t", "\\012", "\n", "\\134", "\\").Replace(left[4])
		kind := right[0]
		if seen[mount] || mount != "/" && kind != "ext4" && kind != "ext3" && kind != "xfs" && kind != "btrfs" && kind != "zfs" {
			continue
		}
		seen[mount] = true
		fs := Filesystem{ID: "fs:" + left[0], MountPoint: mount, SampledAt: time.Now().UTC(), UsagePercent: Missing("unavailable", "STATFS_DENIED")}
		var stat unix.Statfs_t
		if err := unix.Statfs(mount, &stat); err == nil && stat.Bsize > 0 && stat.Blocks > 0 {
			total := stat.Blocks * uint64(stat.Bsize)
			free := stat.Bfree * uint64(stat.Bsize)
			available := stat.Bavail * uint64(stat.Bsize)
			if free <= total {
				used := total - free
				fs.TotalBytes = &total
				fs.UsedBytes = &used
				fs.FreeBytes = &free
				fs.AvailableBytes = &available
				fs.UsagePercent = Number(100 * float64(used) / float64(total))
			}
		}
		result = append(result, fs)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].MountPoint < result[j].MountPoint })
	return result
}

// availableBytes 读取目的卷上非特权用户可用空间。
// 安装预检不使用包含保留块的 free 字段。
func availableBytes(path string) (uint64, error) {
	var stat unix.Statfs_t
	if err := unix.Statfs(path, &stat); err != nil {
		return 0, err
	}
	return stat.Bavail * uint64(stat.Bsize), nil
}

// sampleProcesses 只读取内核名称、UID 和计数，不读取可能含秘密的 argv。
// PID 复用由 bootId 与内核启动 ticks 联合识别。
func sampleProcesses(bootID string, bootedAt *time.Time) ([]Process, map[string]float64, error) {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return nil, nil, err
	}
	items := []Process{}
	counters := map[string]float64{}
	ticks := clockTicks()
	users := map[string]string{}
	for _, entry := range entries {
		pid, err := strconv.Atoi(entry.Name())
		if err != nil || pid <= 0 {
			continue
		}
		text := readSmall("/proc/" + entry.Name() + "/stat")
		open, end := strings.Index(text, "("), strings.LastIndex(text, ")")
		if open < 0 || end <= open {
			continue
		}
		f := strings.Fields(text[end+1:])
		if len(f) < 22 {
			continue
		}
		ppid, e1 := strconv.Atoi(f[1])
		start, e2 := strconv.ParseUint(f[19], 10, 64)
		utime, e3 := strconv.ParseUint(f[11], 10, 64)
		stime, e4 := strconv.ParseUint(f[12], 10, 64)
		rss, e5 := strconv.ParseUint(f[21], 10, 64)
		if e1 != nil || e2 != nil || e3 != nil || e4 != nil || e5 != nil || ticks <= 0 || bootedAt == nil {
			continue
		}
		key := fmt.Sprintf("%s:%d:%d", bootID, pid, start)
		bytes := rss * uint64(os.Getpagesize())
		p := Process{PID: pid, PPID: ppid, ProcessKey: key, Name: text[open+1 : end], StartedAt: bootedAt.Add(time.Duration(float64(start) / ticks * float64(time.Second))), RSSBytes: &bytes}
		for _, line := range strings.Split(readSmall("/proc/"+entry.Name()+"/status"), "\n") {
			if strings.HasPrefix(line, "Uid:") {
				ids := strings.Fields(line)
				if len(ids) > 1 {
					name, ok := users[ids[1]]
					if !ok {
						name = ids[1]
						if u, err := user.LookupId(name); err == nil {
							name = u.Username
						}
						users[ids[1]] = name
					}
					p.User = &name
				}
				break
			}
		}
		for _, line := range strings.Split(readSmall("/proc/"+entry.Name()+"/cgroup"), "\n") {
			for _, component := range strings.Split(line, "/") {
				if strings.HasPrefix(component, "zx-panel-app-") && strings.HasSuffix(component, ".service") {
					id := strings.TrimSuffix(strings.TrimPrefix(component, "zx-panel-app-"), ".service")
					if resourcePattern.MatchString(id) {
						p.AppID = &id
					}
				}
			}
		}
		items = append(items, p)
		counters[key] = float64(utime+stime) / ticks
	}
	if ticks <= 0 {
		return items, counters, errors.New("process clock frequency unavailable")
	}
	return items, counters, nil
}

// inspectProcessReferences 遍历 executable 链接，检查不完整即阻止卸载。
// 只用于有副作用操作预检，不暴露其他进程路径。
func inspectProcessReferences(root string) ([]int, bool) {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return nil, false
	}
	pids, complete := []int{}, true
	for _, entry := range entries {
		if _, err := strconv.Atoi(entry.Name()); err != nil {
			continue
		}
		path, err := os.Readlink("/proc/" + entry.Name() + "/exe")
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			complete = false
			continue
		}
		if pathWithin(root, strings.TrimSuffix(path, " (deleted)")) {
			pid, _ := strconv.Atoi(entry.Name())
			pids = append(pids, pid)
		}
	}
	return pids, complete
}
