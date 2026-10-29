package control

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"unicode/utf8"
	"zx-panel/internal/security"
)

// namePattern 只允许可预测的应用标识，不能成为 systemd 配置片段。
// unit 文件另用服务端生成的不可预测 ID 命名。
var namePattern = regexp.MustCompile(`^[a-z][a-z0-9-]{1,63}$`)

// environmentPattern 与 POSIX 环境变量命名保持一致。
// NUL、超限键值和重复变更另外校验。
var environmentPattern = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]{0,127}$`)

// resourcePattern 限制本服务产生的资源 ID 字符集与大小。
// 它不替代数据库授权或路径包含关系检查。
var resourcePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$`)

// DecodeOperation 在严格 JSON 边界上再检查动作的精确字段集合。
// 禁止另一个动作的已知字段被默认零值掩盖。
func DecodeOperation(data []byte) (Operation, error) {
	var op Operation
	if err := security.DecodeBytes(data, &op); err != nil {
		return op, err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return op, err
	}
	allowed := map[string][]string{"runtime.install": {"action", "releaseId", "makeDefault"}, "runtime.set-default": {"action", "installationId", "expectedRevision"}, "runtime.uninstall": {"action", "installationId", "expectedRevision"}, "app.create": {"action", "app", "environmentChanges"}, "app.update": {"action", "appId", "expectedRevision", "app", "environmentChanges"}, "app.start": {"action", "appId", "expectedRevision"}, "app.stop": {"action", "appId", "expectedRevision"}, "app.restart": {"action", "appId", "expectedRevision"}, "app.delete": {"action", "appId", "expectedRevision"}}
	keys, ok := allowed[op.Action]
	if !ok {
		return op, Fail(422, "INVALID_INPUT", "操作类型无效")
	}
	for key := range fields {
		if !slices.Contains(keys, key) {
			return op, Fail(422, "INVALID_INPUT", "该操作包含无关字段")
		}
	}
	for _, key := range keys {
		raw, exists := fields[key]
		if !exists || string(raw) == "null" {
			return op, Fail(422, "INVALID_INPUT", "操作缺少必填字段")
		}
	}
	if op.ReleaseID != "" && !resourcePattern.MatchString(op.ReleaseID) || op.InstallationID != "" && !resourcePattern.MatchString(op.InstallationID) || op.AppID != "" && !resourcePattern.MatchString(op.AppID) {
		return op, Fail(422, "INVALID_INPUT", "资源 ID 无效")
	}
	if slices.Contains(keys, "expectedRevision") && (op.ExpectedRevision == "" || len(op.ExpectedRevision) > 30) {
		return op, Fail(422, "INVALID_INPUT", "资源修订号无效")
	}
	if op.Action == "runtime.install" && (op.ReleaseID == "" || op.MakeDefault == nil) {
		return op, Fail(422, "INVALID_INPUT", "必须明确版本和默认值选择")
	}
	if slices.Contains(keys, "installationId") && op.InstallationID == "" || slices.Contains(keys, "appId") && op.AppID == "" {
		return op, Fail(422, "INVALID_INPUT", "资源 ID 不能为空")
	}
	if op.App != nil {
		if err := validateDraft(*op.App); err != nil {
			return op, err
		}
		var nested struct {
			App struct {
				Execution map[string]json.RawMessage `json:"execution"`
			} `json:"app"`
		}
		if err := json.Unmarshal(data, &nested); err != nil {
			return op, err
		}
		executionKeys := []string{"kind", "args", "executablePath", "buildToolchainLabel"}
		if op.App.Execution.Kind == "node" {
			executionKeys = []string{"kind", "args", "runtimeInstallationId", "entryFile"}
		}
		for key := range nested.App.Execution {
			if !slices.Contains(executionKeys, key) {
				return op, Fail(422, "INVALID_INPUT", "执行方式包含无关字段")
			}
		}
		for _, key := range executionKeys {
			if _, ok := nested.App.Execution[key]; !ok {
				return op, Fail(422, "INVALID_INPUT", "执行方式缺少字段")
			}
		}
	}
	seen := map[string]bool{}
	var environmentFields struct {
		Changes []map[string]json.RawMessage `json:"environmentChanges"`
	}
	if err := json.Unmarshal(data, &environmentFields); err != nil {
		return op, err
	}
	for _, change := range environmentFields.Changes {
		var action string
		if err := json.Unmarshal(change["action"], &action); err != nil {
			return op, Fail(422, "INVALID_INPUT", "环境动作缺失")
		}
		allowedKeys := []string{"action", "key"}
		if action == "set" {
			allowedKeys = append(allowedKeys, "value", "secret")
		}
		for key := range change {
			if !slices.Contains(allowedKeys, key) {
				return op, Fail(422, "INVALID_INPUT", "环境动作包含无关字段")
			}
		}
		for _, key := range allowedKeys {
			if _, exists := change[key]; !exists {
				return op, Fail(422, "INVALID_INPUT", "环境动作缺少必填字段")
			}
		}
	}
	total := 0
	if len(op.EnvironmentChanges) > 100 {
		return op, Fail(422, "INVALID_INPUT", "环境变更超过 100 项")
	}
	for _, change := range op.EnvironmentChanges {
		if !environmentPattern.MatchString(change.Key) || seen[change.Key] {
			return op, Fail(422, "INVALID_INPUT", "环境变量名无效或重复")
		}
		seen[change.Key] = true
		switch change.Action {
		case "set":
			if change.Value == nil || change.Secret == nil || strings.ContainsRune(*change.Value, 0) || !utf8.ValidString(*change.Value) {
				return op, Fail(422, "INVALID_INPUT", "环境变量值无效")
			}
			total += len(*change.Value)
		case "remove":
			if change.Value != nil || change.Secret != nil {
				return op, Fail(422, "INVALID_INPUT", "移除变量不能携带值")
			}
		default:
			return op, Fail(422, "INVALID_INPUT", "环境变更动作无效")
		}
	}
	if total > 64<<10 {
		return op, Fail(422, "INVALID_INPUT", "环境变量总大小超过 64 KiB")
	}
	return op, nil
}

// validateDraft 验证无需 IO 的字段约束，保留参数原始空格。
// 真实路径、执行权限、账号和运行时引用由预检核实。
func validateDraft(app AppDraft) error {
	if !namePattern.MatchString(app.Name) || !filepath.IsAbs(app.WorkingDirectory) || len(app.WorkingDirectory) > 4096 || app.RunAsUser == "" || app.RunAsUser == "root" || len(app.RunAsUser) > 64 {
		return Fail(422, "INVALID_INPUT", "应用名称、目录或服务账号无效")
	}
	if app.WorkingDirectory != strings.TrimSpace(app.WorkingDirectory) || strings.HasSuffix(app.WorkingDirectory, "\\") {
		return Fail(422, "INVALID_PATH", "工作目录不能以空白或反斜杠结尾")
	}
	if app.RestartPolicy != "no" && app.RestartPolicy != "on-failure" {
		return Fail(422, "INVALID_INPUT", "重启策略无效")
	}
	if app.Execution.Kind != "node" && app.Execution.Kind != "binary" {
		return Fail(422, "INVALID_INPUT", "执行方式无效")
	}
	if app.Execution.Kind == "node" && (!resourcePattern.MatchString(app.Execution.RuntimeInstallationID) || app.Execution.EntryFile == "" || filepath.IsAbs(app.Execution.EntryFile) || !filepath.IsLocal(app.Execution.EntryFile)) {
		return Fail(422, "INVALID_INPUT", "Node.js 入口必须在项目目录内")
	}
	if app.Execution.Kind == "binary" && !filepath.IsAbs(app.Execution.ExecutablePath) {
		return Fail(422, "INVALID_INPUT", "可执行文件必须为绝对路径")
	}
	if len(app.Execution.Args) > 128 {
		return Fail(422, "INVALID_INPUT", "启动参数超过 128 项")
	}
	total := 0
	for _, arg := range app.Execution.Args {
		if strings.ContainsRune(arg, 0) || !utf8.ValidString(arg) {
			return Fail(422, "INVALID_INPUT", "启动参数包含无效字符")
		}
		total += len(arg)
	}
	if total > 32<<10 {
		return Fail(422, "INVALID_INPUT", "启动参数超过 32 KiB")
	}
	if strings.ContainsAny(app.WorkingDirectory, "\x00\r\n") || strings.ContainsAny(app.Execution.EntryFile+app.Execution.ExecutablePath, "\x00\r\n") {
		return Fail(422, "INVALID_INPUT", "路径包含控制字符")
	}
	return nil
}

// operationLabel 为任务与计划提供固定说明，不插入秘密输入。
// 未知内部动作只使用稳定名称。
func operationLabel(action string) string {
	labels := map[string]string{"runtime.install": "安装运行时版本", "runtime.set-default": "设置面板默认版本", "runtime.uninstall": "卸载运行时版本", "app.create": "登记本机应用", "app.update": "保存应用配置", "app.start": "启动应用", "app.stop": "停止应用", "app.restart": "重启应用", "app.delete": "移除应用登记", "catalog.refresh": "检查官方版本目录", "logs.export": "导出所选日志"}
	if value, ok := labels[action]; ok {
		return value
	}
	return fmt.Sprintf("操作 %s", action)
}
