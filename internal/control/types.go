// Package control 提供本机面板的业务模型、持久操作和资源查询。
// 该包不依赖 Gin，所有主机操作限制在服务配置的本机资源内。
package control

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"
)

// Fault 描述能够安全返回客户端的领域错误。
// Cause 只供服务日志使用，禁止序列化到 HTTP 响应。
type Fault struct {
	Status  int
	Code    string
	Message string
	Cause   error
}

// Error 返回公开错误消息，不拼接内部 SQL 或路径秘密。
// 调用方可通过 errors.As 取得状态和代码。
func (e *Fault) Error() string { return e.Message }

// Fail 创建无内部细节的稳定业务错误。
// 可恢复的任务错误在任务结果中单独标识。
func Fail(status int, code, message string) error {
	return &Fault{Status: status, Code: code, Message: message}
}

// ID 生成不可预测的本机资源标识，不编码路径或主机地址。
// 随机源失败会阻止本次资源创建。
func ID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(b[:]), nil
}

// Capability 表示已探测的能力及不可用原因。
// 前端提示不是授权，实际执行仍重新检查。
type Capability struct {
	Enabled    bool    `json:"enabled"`
	ReasonCode *string `json:"reasonCode"`
	Message    *string `json:"message"`
}

// Capabilities 按操作暴露当前本机能力。
// 启动探测和运行期权限改变均可更新该快照。
type Capabilities struct {
	ReadMetrics          Capability `json:"readMetrics"`
	InstallRuntime       Capability `json:"installRuntime"`
	ChangeRuntimeDefault Capability `json:"changeRuntimeDefault"`
	UninstallRuntime     Capability `json:"uninstallRuntime"`
	ManageApps           Capability `json:"manageApps"`
	ReadProcesses        Capability `json:"readProcesses"`
	ReadLogs             Capability `json:"readLogs"`
	ExportLogs           Capability `json:"exportLogs"`
	EditSettings         Capability `json:"editSettings"`
}

// OSInfo 记录实际探测的操作系统而非设计样例。
// 非 Linux 环境可以返回受限信息。
type OSInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Kernel  string `json:"kernel"`
}

// LibcInfo 用于识别运行时归档的系统兼容性。
// 未能可靠探测版本时明确返回 null。
type LibcInfo struct {
	Family  string  `json:"family"`
	Version *string `json:"version"`
}

// SystemInfo 描述本服务实际所在机器的可读信息。
// 不提供服务器数组或远程执行目标。
type SystemInfo struct {
	Hostname         string     `json:"hostname"`
	OS               OSInfo     `json:"os"`
	Architecture     string     `json:"architecture"`
	Libc             *LibcInfo  `json:"libc"`
	CPUModel         *string    `json:"cpuModel"`
	LogicalCPUCount  int        `json:"logicalCpuCount"`
	MemoryTotalBytes *uint64    `json:"memoryTotalBytes"`
	BootID           string     `json:"bootId"`
	BootedAt         *time.Time `json:"bootedAt"`
	UptimeSeconds    *float64   `json:"uptimeSeconds"`
	ServerTimezone   string     `json:"serverTimezone"`
	ObservationScope string     `json:"observationScope"`
	AppSupervisor    string     `json:"appSupervisor"`
	RuntimeRoot      string     `json:"runtimeRoot"`
	AppRoots         []string   `json:"appRoots"`
	ServiceAccounts  []string   `json:"serviceAccounts"`
}

// Value 区分测量零值、预热和采集不可用。
// 不可用原因可用于界面解释。
type Value struct {
	Value      *float64 `json:"value"`
	Quality    string   `json:"quality"`
	ReasonCode *string  `json:"reasonCode"`
}

// Number 创建有限数值的测量点。
// 无效输入应在调用处转换为 Missing。
func Number(v float64) Value { return Value{Value: &v, Quality: "ok"} }

// Missing 表示无法用于连续曲线的采样缺口。
// quality 应为 warming-up 或 unavailable。
func Missing(quality, reason string) Value { return Value{Quality: quality, ReasonCode: &reason} }

// LoadAverage 单独记录系统负载，不能当作百分比。
// 所有值来自同一采样时刻。
type LoadAverage struct {
	One     float64 `json:"one"`
	Five    float64 `json:"five"`
	Fifteen float64 `json:"fifteen"`
}

// Memory 保存 MemAvailable 口径及独立 Swap 信息。
// 缺失字段保留 null，不填充估计值。
type Memory struct {
	TotalBytes     *uint64 `json:"totalBytes"`
	UsedBytes      *uint64 `json:"usedBytes"`
	AvailableBytes *uint64 `json:"availableBytes"`
	CachedBytes    *uint64 `json:"cachedBytes"`
	UsagePercent   Value   `json:"usagePercent"`
	SwapTotalBytes *uint64 `json:"swapTotalBytes"`
	SwapUsedBytes  *uint64 `json:"swapUsedBytes"`
}

// Filesystem 保留容量真实采集时间和保留块口径。
// available 与 free 不混用。
type Filesystem struct {
	ID             string    `json:"id"`
	MountPoint     string    `json:"mountPoint"`
	SampledAt      time.Time `json:"sampledAt"`
	TotalBytes     *uint64   `json:"totalBytes"`
	UsedBytes      *uint64   `json:"usedBytes"`
	FreeBytes      *uint64   `json:"freeBytes"`
	AvailableBytes *uint64   `json:"availableBytes"`
	UsagePercent   Value     `json:"usagePercent"`
}

// BlockDevice 记录实际间隔计算的块设备吞吐。
// 父设备和分区不自动叠加。
type BlockDevice struct {
	ID                  string `json:"id"`
	Name                string `json:"name"`
	ReadBytesPerSecond  Value  `json:"readBytesPerSecond"`
	WriteBytesPerSecond Value  `json:"writeBytesPerSecond"`
}

// Network 使用字符串表示可能超过 JS 安全整数的累计字节。
// isPrimary 依据本机路由选择。
type Network struct {
	ID               string  `json:"id"`
	Name             string  `json:"name"`
	IsPrimary        bool    `json:"isPrimary"`
	RXBytesPerSecond Value   `json:"rxBytesPerSecond"`
	TXBytesPerSecond Value   `json:"txBytesPerSecond"`
	RXTotalBytes     *string `json:"rxTotalBytes"`
	TXTotalBytes     *string `json:"txTotalBytes"`
}

// Snapshot 是不可变的共享采集结果。
// 各浏览器读取同一快照，不触发独立扫描。
type Snapshot struct {
	SampledAt         time.Time     `json:"sampledAt"`
	BootID            string        `json:"bootId"`
	Sequence          uint64        `json:"sequence"`
	IntervalMS        int64         `json:"intervalMs"`
	CPUUsagePercent   Value         `json:"cpuUsagePercent"`
	CPUPerCorePercent []Value       `json:"cpuPerCorePercent"`
	LoadAverage       *LoadAverage  `json:"loadAverage"`
	Memory            Memory        `json:"memory"`
	Filesystems       []Filesystem  `json:"filesystems"`
	BlockDevices      []BlockDevice `json:"blockDevices"`
	Networks          []Network     `json:"networks"`
}

// HistoryPoint 保存峰值和样本量，避免聚合隐藏异常。
// 没有样本的桶返回 null。
type HistoryPoint struct {
	At          time.Time `json:"at"`
	Avg         *float64  `json:"avg"`
	Min         *float64  `json:"min"`
	Max         *float64  `json:"max"`
	SampleCount int       `json:"sampleCount"`
}

// History 是受点数限制的单指标历史。
// 时间覆盖范围不会通过随机数据补齐。
type History struct {
	Metric        string         `json:"metric"`
	Unit          string         `json:"unit"`
	DeviceID      *string        `json:"deviceId"`
	StepSeconds   int            `json:"stepSeconds"`
	AvailableFrom *time.Time     `json:"availableFrom"`
	Points        []HistoryPoint `json:"points"`
}

// Installation 标识一个版本、平台和路径对应的安装实例。
// 外部发现的实例始终只读。
type Installation struct {
	ID                     string     `json:"id"`
	Kind                   string     `json:"kind"`
	Version                string     `json:"version"`
	Architecture           string     `json:"architecture"`
	Path                   string     `json:"path"`
	Ownership              string     `json:"ownership"`
	State                  string     `json:"state"`
	IsPanelDefault         bool       `json:"isPanelDefault"`
	ConfiguredAppRefs      int        `json:"configuredAppRefs"`
	ObservedProcessRefs    *int       `json:"observedProcessRefs"`
	ReferenceCheckComplete bool       `json:"referenceCheckComplete"`
	InstalledAt            *time.Time `json:"installedAt"`
	Revision               string     `json:"revision"`
}

// Release 表示通过允许的官方源发现的归档。
// URL 与摘要仅服务端保存，不接受浏览器指定下载地址。
type Release struct {
	ID                     string  `json:"id"`
	Kind                   string  `json:"kind"`
	Version                string  `json:"version"`
	Channel                string  `json:"channel"`
	Maintenance            string  `json:"maintenance"`
	Platform               string  `json:"platform"`
	DownloadBytes          *int64  `json:"downloadBytes"`
	InstalledBytesEstimate *int64  `json:"installedBytesEstimate"`
	Compatible             bool    `json:"compatible"`
	IncompatibilityReason  *string `json:"incompatibilityReason"`
	VerifiedArtifactCached bool    `json:"verifiedArtifactCached"`
}

// Artifact 是经过目录适配器约束的内部下载元数据。
// 其 URL 不能通过 API 写入。
type Artifact struct {
	Release     Release `json:"release"`
	URL         string  `json:"url"`
	SHA256      string  `json:"sha256"`
	ArchiveRoot string  `json:"archiveRoot"`
}

// Execution 定义互斥的 Node 与二进制启动方式。
// ValidateOperation 负责拒绝另一种方式的无关字段。
type Execution struct {
	Kind                  string   `json:"kind"`
	RuntimeInstallationID string   `json:"runtimeInstallationId,omitempty"`
	EntryFile             string   `json:"entryFile,omitempty"`
	ExecutablePath        string   `json:"executablePath,omitempty"`
	Args                  []string `json:"args"`
	BuildToolchainLabel   *string  `json:"buildToolchainLabel"`
}

// AppDraft 保存受控应用的非秘密配置。
// 服务账号必须来自配置允许列表。
type AppDraft struct {
	Name             string    `json:"name"`
	WorkingDirectory string    `json:"workingDirectory"`
	RunAsUser        string    `json:"runAsUser"`
	Execution        Execution `json:"execution"`
	RestartPolicy    string    `json:"restartPolicy"`
}

// EnvironmentKey 只返回变量名和秘密标识。
// 已有值不回显给浏览器。
type EnvironmentKey struct {
	Name   string `json:"name"`
	Secret bool   `json:"secret"`
}

// App 是应用配置与监督状态的公开快照。
// 应用运行中不等于业务健康。
type App struct {
	ID               string           `json:"id"`
	Revision         string           `json:"revision"`
	Name             string           `json:"name"`
	WorkingDirectory string           `json:"workingDirectory"`
	RunAsUser        string           `json:"runAsUser"`
	Execution        Execution        `json:"execution"`
	RestartPolicy    string           `json:"restartPolicy"`
	UnitName         string           `json:"unitName"`
	Status           string           `json:"status"`
	MainPID          *int             `json:"mainPid"`
	StartedAt        *time.Time       `json:"startedAt"`
	CPUUsagePercent  *float64         `json:"cpuUsagePercent"`
	MemoryBytes      *uint64          `json:"memoryBytes"`
	EnvironmentKeys  []EnvironmentKey `json:"environmentKeys"`
	PendingRestart   bool             `json:"pendingRestart"`
}

// EnvironmentChange 仅提交用户改变的环境项。
// 任务与计划持久化前必须加密该输入。
type EnvironmentChange struct {
	Action string  `json:"action"`
	Key    string  `json:"key"`
	Value  *string `json:"value,omitempty"`
	Secret *bool   `json:"secret,omitempty"`
}

// Operation 是内部统一输入，HTTP 层还要检查动作精确字段集合。
// 所有远程目标、shell 或自定义下载地址均不在该契约内。
type Operation struct {
	Action             string              `json:"action"`
	ReleaseID          string              `json:"releaseId,omitempty"`
	MakeDefault        *bool               `json:"makeDefault,omitempty"`
	InstallationID     string              `json:"installationId,omitempty"`
	ExpectedRevision   string              `json:"expectedRevision,omitempty"`
	AppID              string              `json:"appId,omitempty"`
	App                *AppDraft           `json:"app,omitempty"`
	EnvironmentChanges []EnvironmentChange `json:"environmentChanges,omitempty"`
}

// Notice 表示可展示的影响、警告或阻止原因。
// 内容不能包含环境秘密。
type Notice struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Plan 是有期限且绑定操作人的执行许可候选。
// 真正执行前仍需重新验证权限和资源状态。
type Plan struct {
	ID               string       `json:"id"`
	Action           string       `json:"action"`
	ExpiresAt        time.Time    `json:"expiresAt"`
	ResourceIDs      []string     `json:"resourceIds"`
	Summary          string       `json:"summary"`
	Warnings         []Notice     `json:"warnings"`
	BlockedReasons   []Notice     `json:"blockedReasons"`
	ConfirmationText *string      `json:"confirmationText"`
	CanExecute       bool         `json:"canExecute"`
	Details          []PlanDetail `json:"details"`
}

// PlanDetail 是后端核验后的只读操作事实，用于最终确认。
// 不包含秘密值、数据库凭据或完整命令参数。
type PlanDetail struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

// Progress 只表示真实可计算的下载字节。
// 其他阶段不制造线性百分比。
type Progress struct {
	CompletedBytes *int64 `json:"completedBytes"`
	TotalBytes     *int64 `json:"totalBytes"`
}

// TaskError 保存任务失败原因及是否允许重新预检。
// 原任务的终态不可重新改回 running。
type TaskError struct {
	Code        string `json:"code"`
	Message     string `json:"message"`
	Recoverable bool   `json:"recoverable"`
}

// Task 是浏览器断开后仍持久存在的操作状态。
// Revision 用于拒绝乱序 SSE 事件。
type Task struct {
	ID                string         `json:"id"`
	Action            string         `json:"action"`
	ResourceIDs       []string       `json:"resourceIds"`
	Status            string         `json:"status"`
	Stage             string         `json:"stage"`
	Revision          int64          `json:"revision"`
	Progress          Progress       `json:"progress"`
	CanCancel         bool           `json:"canCancel"`
	CancelRequestedAt *time.Time     `json:"cancelRequestedAt"`
	CreatedAt         time.Time      `json:"createdAt"`
	StartedAt         *time.Time     `json:"startedAt"`
	FinishedAt        *time.Time     `json:"finishedAt"`
	Result            map[string]any `json:"result"`
	Error             *TaskError     `json:"error"`
}

// Process 通过启动标识区分 PID 复用。
// 非托管进程不提供任何控制动作。
type Process struct {
	PID        int       `json:"pid"`
	PPID       int       `json:"ppid"`
	StartedAt  time.Time `json:"startedAt"`
	ProcessKey string    `json:"processKey"`
	Name       string    `json:"name"`
	User       *string   `json:"user"`
	CPUPercent *float64  `json:"cpuPercent"`
	RSSBytes   *uint64   `json:"rssBytes"`
	AppID      *string   `json:"appId"`
}

// LogRecord 是已脱敏且可能截断的一条日志。
// 前端只能按文本展示。
type LogRecord struct {
	ID        string    `json:"id"`
	SourceID  string    `json:"sourceId"`
	At        time.Time `json:"at"`
	Level     string    `json:"level"`
	Message   string    `json:"message"`
	Truncated bool      `json:"truncated"`
}

// Page 统一普通列表分页，空列表必须初始化为非 nil。
// 不透明游标由服务端检查范围。
type Page[T any] struct {
	Items      []T     `json:"items"`
	NextCursor *string `json:"nextCursor"`
}

// Event 是主 SSE 的带 epoch 帧。
// Payload 在构造时序列化，发布后不再修改。
type Event struct {
	ID          string          `json:"-"`
	Name        string          `json:"-"`
	Actor       int64           `json:"-"`
	StreamEpoch string          `json:"streamEpoch"`
	Payload     json.RawMessage `json:"payload"`
	At          time.Time       `json:"-"`
}

// Revision 将数据库修订号转为 API 不透明字符串。
// 前端只比较相等，不使用字典序推导大小。
func Revision(n int64) string { return fmt.Sprint(n) }
