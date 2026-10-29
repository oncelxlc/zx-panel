// Package host 提供不使用 shell 的受限本机 helper 协议。
// 服务只允许配置指定的 Unix Socket 对端与目录资源。
package host

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"time"
)

// Definition 保存生成 systemd unit 所必需的已验证字段。
// 环境值只在受认证本机 Socket 内传输，禁止写入响应或日志。
type Definition struct {
	ID          string            `json:"id"`
	Directory   string            `json:"directory"`
	User        string            `json:"user"`
	Executable  string            `json:"executable"`
	Args        []string          `json:"args"`
	Restart     string            `json:"restart"`
	Environment map[string]string `json:"environment"`
}

// Request 是枚举动作协议，不能携带命令名、shell 或任意 unit 名称。
// 路径在 helper 内独立重新验证。
type Request struct {
	Action      string      `json:"action"`
	ID          string      `json:"id"`
	Kind        string      `json:"kind,omitempty"`
	Version     string      `json:"version,omitempty"`
	StageID     string      `json:"stageId,omitempty"`
	SHA256      string      `json:"sha256,omitempty"`
	ArchiveRoot string      `json:"archiveRoot,omitempty"`
	Definition  *Definition `json:"definition,omitempty"`
	After       string      `json:"after,omitempty"`
	Before      string      `json:"before,omitempty"`
	From        string      `json:"from,omitempty"`
	To          string      `json:"to,omitempty"`
	Limit       int         `json:"limit,omitempty"`
}

// State 是 systemd 已核实的快照，未知字段使用空值。
// cgroup 累计 CPU 与内存由 web 采集器换算，不假装应用健康。
type State struct {
	Status      string     `json:"status"`
	MainPID     int        `json:"mainPid"`
	StartedAt   *time.Time `json:"startedAt"`
	CPUSeconds  *float64   `json:"cpuSeconds"`
	MemoryBytes *uint64    `json:"memoryBytes"`
}

// JournalLine 保留 systemd 游标和消息，不解释为 HTML。
// Helper 限制返回条数与消息长度。
type JournalLine struct {
	Cursor    string    `json:"cursor"`
	At        time.Time `json:"at"`
	Level     string    `json:"level"`
	Message   string    `json:"message"`
	Truncated bool      `json:"truncated"`
}

// InstallationEvidence 只来自 root 拥有的提交标记和真实可执行文件。
// 它用于崩溃恢复核对，不能由 web 进程指定安装路径。
type InstallationEvidence struct {
	ID          string    `json:"id"`
	Kind        string    `json:"kind"`
	Version     string    `json:"version"`
	SHA256      string    `json:"sha256"`
	Path        string    `json:"path"`
	InstalledAt time.Time `json:"installedAt"`
}

// Result 返回公开状态和固定错误代码，不回传子进程 stderr。
// 内部命令失败的诊断由 helper 的本机 journal 保留。
type Result struct {
	OK           bool                  `json:"ok"`
	Code         string                `json:"code,omitempty"`
	State        *State                `json:"state,omitempty"`
	Lines        []JournalLine         `json:"lines,omitempty"`
	Path         string                `json:"path,omitempty"`
	References   *int                  `json:"references,omitempty"`
	Complete     bool                  `json:"complete,omitempty"`
	More         bool                  `json:"more,omitempty"`
	Installation *InstallationEvidence `json:"installation,omitempty"`
	ProcessIDs   []int                 `json:"processIds,omitempty"`
}

// Client 每次调用独立建立 Unix 连接，超时同时终止远端操作。
// 主服务不通过 helper 调用任何自定义命令。
type Client struct{ Socket string }

// Call 限定单次请求和响应体积，并把取消传递给 Socket。
// Unix peer 认证由 helper 服务端执行。
func (c Client) Call(ctx context.Context, request Request) (Result, error) {
	var result Result
	dialer := net.Dialer{Timeout: 2 * time.Second}
	connection, err := dialer.DialContext(ctx, "unix", c.Socket)
	if err != nil {
		return result, fmt.Errorf("helper connection: %w", err)
	}
	defer connection.Close()
	deadline := time.Now().Add(2 * time.Minute)
	if until, ok := ctx.Deadline(); ok && until.Before(deadline) {
		deadline = until
	}
	if err = connection.SetDeadline(deadline); err != nil {
		return result, err
	}
	stop := context.AfterFunc(ctx, func() { connection.Close() })
	defer stop()
	if err = json.NewEncoder(connection).Encode(request); err != nil {
		return result, err
	}
	decoder := json.NewDecoder(io.LimitReader(connection, 16<<20))
	decoder.DisallowUnknownFields()
	if err = decoder.Decode(&result); err != nil {
		return result, err
	}
	if !result.OK {
		return result, errors.New("helper rejected action: " + result.Code)
	}
	return result, nil
}
