//go:build !linux

package control

import (
	"errors"
	"os"
	"runtime"
	"time"
	"zx-panel/internal/config"
)

// samplePlatform 仅返回平台可证实的基础信息，不制造 Linux 指标。
// Windows 开发模式中的写能力由 capability 明确禁用。
func samplePlatform(cfg config.PanelConfig) (rawSample, SystemInfo, error) {
	hostname, _ := os.Hostname()
	return rawSample{At: time.Now(), Memory: Memory{UsagePercent: Missing("unavailable", "UNSUPPORTED_PLATFORM")}}, SystemInfo{Hostname: hostname, OS: OSInfo{Name: runtime.GOOS}, Architecture: runtime.GOARCH, LogicalCPUCount: runtime.NumCPU(), ServerTimezone: "UTC", ObservationScope: "restricted", AppSupervisor: "none", RuntimeRoot: cfg.Paths.RuntimeRoot, AppRoots: cfg.Paths.AppRoots, ServiceAccounts: cfg.Helper.ServiceAccounts}, errors.New("Linux metrics unavailable on this platform")
}

// sampleFilesystems 不在未支持平台解析命令输出。
// 空集合表示没有可用的文件系统采样。
func sampleFilesystems() []Filesystem { return []Filesystem{} }

// availableBytes 要求受支持的原生 Linux 平台。
// 不以未知容量通过安装预检。
func availableBytes(string) (uint64, error) { return 0, errors.New("unsupported platform") }

// sampleProcesses 在受限预览中明确拒绝 Linux 进程查询。
// 调用方应转换为 CAPABILITY_UNAVAILABLE。
func sampleProcesses(string, *time.Time) ([]Process, map[string]float64, error) {
	return nil, nil, errors.New("unsupported platform")
}

// inspectProcessReferences 无法检查时采取拒绝卸载策略。
// 未知状态不等价于没有进程引用。
func inspectProcessReferences(string) ([]int, bool) { return nil, false }
