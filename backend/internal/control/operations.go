package control

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"
	"zx-panel/internal/host"
)

// Work 保存已受理任务的独立加密输入，生命周期不依赖原计划过期。
// Artifact 固定官方摘要；环境秘密只在解密后的短期内存中使用。
type Work struct {
	Operation Operation  `json:"operation"`
	Artifact  *Artifact  `json:"artifact,omitempty"`
	Kind      string     `json:"kind,omitempty"`
	Logs      *LogFilter `json:"logs,omitempty"`
}

// Acceptance 是确认计划的严格输入，客户端不得再次改写操作参数。
// confirmationText 的空值与实际文本有明确含义。
type Acceptance struct {
	PlanID           string  `json:"planId"`
	ConfirmationText *string `json:"confirmationText"`
}

// Preview 执行外部只读检查，并保存六十秒有效的操作计划。
// 预检不会安装运行时或改变应用状态。
func (s *Service) Preview(ctx context.Context, actor int64, op Operation) (Plan, error) {
	work := Work{Operation: op}
	if op.Action == "runtime.install" {
		artifact, err := s.resolveArtifact(ctx, op.ReleaseID)
		if err != nil {
			return Plan{}, err
		}
		work.Artifact = &artifact
	}
	plan, err := s.inspect(ctx, work)
	if err != nil {
		return plan, err
	}
	plan.ID, err = ID()
	if err != nil {
		return plan, err
	}
	plan.ExpiresAt = time.Now().UTC().Add(time.Minute)
	body, err := json.Marshal(plan)
	if err != nil {
		return plan, err
	}
	plain, err := json.Marshal(work)
	if err != nil {
		return plan, err
	}
	encrypted, err := s.Vault.Seal("plan:"+plan.ID, plain)
	if err != nil {
		return plan, err
	}
	tx, err := s.Repo.DB.Begin(ctx)
	if err != nil {
		return plan, err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", actor); err != nil {
		return plan, err
	}
	var count int
	if err = tx.QueryRow(ctx, "SELECT count(*) FROM app.operation_plans WHERE actor_id=$1 AND expires_at>now() AND NOT consumed", actor).Scan(&count); err != nil {
		return plan, err
	}
	if count >= 30 {
		return plan, Fail(429, "RATE_LIMITED", "当前有效预检过多，请稍后重试")
	}
	if _, err = tx.Exec(ctx, "INSERT INTO app.operation_plans(id,actor_id,expires_at,payload,encrypted_input) VALUES($1,$2,$3,$4,$5)", plan.ID, actor, plan.ExpiresAt, body, encrypted); err != nil {
		return plan, err
	}
	if !plan.CanExecute {
		if err = auditTx(ctx, tx, actor, op.Action, "", "", "denied", "预检未通过资源或权限检查"); err != nil {
			return plan, err
		}
	}
	return plan, tx.Commit(ctx)
}

// inspect 每次受理和执行前重新检查能力、引用、路径、修订与空间。
// 检查不完整时产生 blockedReasons，不能把未知值当作安全许可。
func (s *Service) inspect(ctx context.Context, work Work) (Plan, error) {
	op := work.Operation
	plan := Plan{Action: op.Action, Summary: operationLabel(op.Action), Warnings: []Notice{}, BlockedReasons: []Notice{}, ResourceIDs: []string{}, Details: []PlanDetail{}}
	block := func(code, message string) { plan.BlockedReasons = append(plan.BlockedReasons, Notice{code, message}) }
	cap := s.Capabilities(ctx)
	if strings.HasPrefix(op.Action, "runtime.") && !cap.InstallRuntime.Enabled || strings.HasPrefix(op.Action, "app.") && !cap.ManageApps.Enabled {
		block("CAPABILITY_UNAVAILABLE", "此操作需要可用的原生 Linux 与本机 helper")
	}
	if s.Draining() {
		block("SERVICE_DRAINING", "服务正在排空，请稍后重新预检")
	}
	if op.Action == "runtime.install" {
		if work.Artifact == nil {
			return plan, Fail(422, "INVALID_INPUT", "安装缺少固定归档")
		}
		artifact := work.Artifact
		plan.Summary = fmt.Sprintf("安装 %s %s（%s）", artifact.Release.Kind, artifact.Release.Version, artifact.Release.Platform)
		plan.Details = []PlanDetail{{"运行时", artifact.Release.Kind + " " + artifact.Release.Version}, {"平台", artifact.Release.Platform}, {"安装根目录", s.Config.Paths.RuntimeRoot}, {"官方来源", artifact.URL}, {"校验", "SHA-256 · " + artifact.SHA256}, {"空间要求", "归档 ≤512 MiB，展开 ≤2 GiB；安装卷至少 3 GiB 可用"}}
		defaultLabel := "保持当前默认版本"
		if op.MakeDefault != nil && *op.MakeDefault {
			defaultLabel = "设为面板默认，不修改系统 PATH 或已有应用绑定"
		}
		plan.Details = append(plan.Details, PlanDetail{"安装后", defaultLabel})
		plan.ResourceIDs = []string{"runtime:" + artifact.Release.Kind}
		if reason := s.runtimeCompatibility(artifact.Release.Kind); reason != "" {
			block("INCOMPATIBLE_PLATFORM", reason)
		}
		installations, err := s.Repo.Installations(ctx, artifact.Release.Kind)
		if err != nil {
			return plan, err
		}
		for _, item := range installations {
			if item.Ownership == "panel" && item.Version == artifact.Release.Version && item.Architecture == s.Metrics.Info().Architecture {
				block("ALREADY_INSTALLED", "这个平台版本已经由面板登记")
			}
		}
		for _, path := range []string{s.Config.Paths.StagingRoot, s.Config.Paths.RuntimeRoot} {
			available, err := availableBytes(path)
			if err != nil {
				block("SPACE_CHECK_INCOMPLETE", "无法核实安装卷的可用空间")
				break
			}
			if available < 3<<30 {
				block("INSUFFICIENT_SPACE", "安装卷至少需要 3 GiB 可用空间以覆盖下载、展开及安全余量")
			}
		}
		plan.Warnings = append(plan.Warnings, Notice{"PRESERVE_EXISTING", "安装会保留旧版本和已有应用绑定"})
		for _, quota := range []struct {
			path             string
			reserve, maximum int64
		}{{s.Config.Paths.RuntimeRoot, 2 << 30, 20 << 30}, {s.Config.Paths.StagingRoot, 512 << 20, 3 << 30}} {
			if err := directoryQuota(ctx, quota.path, quota.reserve, quota.maximum); err != nil {
				block("STORAGE_QUOTA_EXCEEDED", "安装目录配额为 20 GiB、暂存配额为 3 GiB；无法完整检查或剩余预算不足")
			}
		}
		if artifact.Release.Kind == "node" && versionParts(artifact.Release.Version)[0] >= 25 {
			plan.Warnings = append(plan.Warnings, Notice{"LIBATOMIC_REQUIRED", "Node.js 25 及以上官方 Linux 包需要 libatomic；受限身份版本检查失败时不会提交安装"})
		}
		if artifact.Release.Maintenance != "supported" {
			plan.Warnings = append(plan.Warnings, Notice{"MAINTENANCE_UNKNOWN", "该版本的维护状态未被核实，请确认适用性"})
		}
	} else if strings.HasPrefix(op.Action, "runtime.") {
		installation, err := s.installation(ctx, op.InstallationID)
		if err != nil {
			return plan, err
		}
		plan.ResourceIDs = []string{"runtime:" + installation.Kind, installation.ID}
		plan.Summary = operationLabel(op.Action) + " · " + installation.Kind + " " + installation.Version
		plan.Details = []PlanDetail{{"安装路径", installation.Path}, {"来源", installation.Ownership}, {"配置引用", fmt.Sprintf("%d 个应用", installation.ConfiguredAppRefs)}}
		if installation.Revision != op.ExpectedRevision {
			block("REVISION_CONFLICT", "安装实例已改变，请重新预检")
		}
		if installation.Ownership != "panel" {
			block("EXTERNAL_READ_ONLY", "外部安装只读，不能修改或卸载")
		}
		if installation.State != "ready" && op.Action == "runtime.set-default" {
			block("INSTALLATION_NOT_READY", "该实例未通过可用性核验")
		}
		if op.Action == "runtime.uninstall" {
			text := installation.Version
			plan.ConfirmationText = &text
			if installation.IsPanelDefault {
				block("DEFAULT_IN_USE", "请先切换面板默认版本")
			}
			if installation.ConfiguredAppRefs > 0 {
				block("RUNTIME_IN_USE", "已有应用配置绑定此安装")
			}
			if installation.Ownership == "panel" && s.Config.Helper.Enabled {
				result, err := s.Host.Call(ctx, host.Request{Action: "runtime.references", Kind: installation.Kind, ID: installation.ID})
				if err != nil || !result.Complete || result.References == nil {
					block("REFERENCE_CHECK_INCOMPLETE", "无法完成运行进程与 unit 引用检查")
				} else if *result.References > 0 {
					block("RUNTIME_IN_USE", "运行进程或 unit 仍引用此安装")
				}
			} else {
				block("REFERENCE_CHECK_INCOMPLETE", "无法完成特权引用检查")
			}
			plan.Warnings = append(plan.Warnings, Notice{"REMOVE_RUNTIME", "仅移除此面板安装目录，应用文件和日志保留"})
		}
	} else if strings.HasPrefix(op.Action, "app.") {
		if op.Action != "app.create" {
			app, err := s.Repo.App(ctx, op.AppID)
			if err != nil {
				return plan, err
			}
			plan.ResourceIDs = append(plan.ResourceIDs, app.ID)
			plan.Summary = operationLabel(op.Action) + " · " + app.Name
			plan.Details = []PlanDetail{{"应用", app.Name}, {"项目目录", app.WorkingDirectory}, {"服务账号", app.RunAsUser}, {"systemd unit", app.UnitName}}
			if app.Execution.Kind == "node" {
				plan.ResourceIDs = append(plan.ResourceIDs, app.Execution.RuntimeInstallationID)
			}
			if app.Revision != op.ExpectedRevision {
				block("REVISION_CONFLICT", "应用配置已改变，请重新加载")
			}
			if op.Action == "app.delete" {
				text := app.Name
				plan.ConfirmationText = &text
				result, err := s.Host.Call(ctx, host.Request{Action: "app.status", ID: app.ID})
				if err != nil || result.State == nil {
					block("STATE_UNAVAILABLE", "无法确认应用已停止")
				} else if result.State.Status != "stopped" && result.State.Status != "failed" {
					block("APP_RUNNING", "删除登记前必须停止应用")
				}
				plan.Warnings = append(plan.Warnings, Notice{"PRESERVE_APP_FILES", "仅移除面板登记和 unit，项目文件及已有 journal 日志保留"})
			}
			if op.Action == "app.restart" || op.Action == "app.stop" {
				plan.Warnings = append(plan.Warnings, Notice{"APP_DOWNTIME", "该操作会中断当前应用进程"})
			}
		}
		if op.App != nil {
			app := *op.App
			plan.Summary = operationLabel(op.Action) + " · " + app.Name
			plan.Details = []PlanDetail{{"应用", app.Name}, {"项目目录", app.WorkingDirectory}, {"服务账号", app.RunAsUser}, {"环境变量变更", fmt.Sprintf("%d 项（值不回显）", len(op.EnvironmentChanges))}}
			if err := validateDraft(app); err != nil {
				return plan, err
			}
			if !slices.Contains(s.Config.Helper.ServiceAccounts, app.RunAsUser) {
				block("SERVICE_ACCOUNT_NOT_ALLOWED", "服务账号不在部署允许列表")
			}
			directory, err := canonicalDirectory(app.WorkingDirectory, s.Config.Paths.AppRoots)
			if err != nil {
				block("PATH_NOT_ALLOWED", "项目目录不在批准范围或无法访问")
			} else {
				if directory != filepath.Clean(app.WorkingDirectory) {
					block("PATH_CHANGED", "请使用解析后的真实项目目录")
				}
				if app.Execution.Kind == "node" {
					installation, err := s.installation(ctx, app.Execution.RuntimeInstallationID)
					if err != nil {
						return plan, err
					}
					plan.ResourceIDs = append(plan.ResourceIDs, installation.ID)
					if installation.Kind != "node" || installation.Ownership != "panel" || installation.State != "ready" {
						block("INSTALLATION_NOT_READY", "应用必须绑定可用的具体面板 Node.js 安装")
					}
					root, err := os.OpenRoot(directory)
					if err != nil {
						block("ENTRY_UNAVAILABLE", "无法读取项目入口")
					} else {
						file, e := root.Open(app.Execution.EntryFile)
						if e != nil {
							block("ENTRY_UNAVAILABLE", "Node.js 入口不存在或逃逸目录")
						} else {
							info, e := file.Stat()
							file.Close()
							if e != nil || !info.Mode().IsRegular() {
								block("ENTRY_UNAVAILABLE", "Node.js 入口必须为普通文件")
							}
						}
						root.Close()
					}
				} else {
					real, err := filepath.EvalSymlinks(app.Execution.ExecutablePath)
					if err != nil || !pathWithin(directory, real) {
						block("EXECUTABLE_NOT_ALLOWED", "二进制必须位于该应用的真实项目目录内")
					} else {
						info, err := os.Stat(real)
						if err != nil || !info.Mode().IsRegular() || info.Mode().Perm()&0111 == 0 {
							block("EXECUTABLE_NOT_ALLOWED", "二进制缺失或没有执行权限")
						}
					}
				}
			}
			var exists bool
			if err := s.Repo.DB.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM app.managed_apps WHERE name=$1 AND id<>$2)", app.Name, op.AppID).Scan(&exists); err != nil {
				return plan, err
			}
			if exists {
				block("APP_NAME_CONFLICT", "应用名称已存在")
			}
			var count int
			if err := s.Repo.DB.QueryRow(ctx, "SELECT count(*) FROM app.managed_apps").Scan(&count); err != nil {
				return plan, err
			}
			if op.Action == "app.create" && count >= 100 {
				block("RESOURCE_LIMIT", "首发最多登记 100 个应用")
			}
			if op.Action == "app.update" {
				plan.Warnings = append(plan.Warnings, Notice{"RESTART_SEPARATE", "保存配置不会重启应用，新配置在下一次启动或重启生效"})
			} else {
				plan.Warnings = append(plan.Warnings, Notice{"CREATED_STOPPED", "登记后默认停止，需要单独确认启动"})
			}
		}
	}
	slices.Sort(plan.ResourceIDs)
	plan.ResourceIDs = slices.Compact(plan.ResourceIDs)
	plan.CanExecute = len(plan.BlockedReasons) == 0
	return plan, nil
}

// installation 只从持久登记中取实例，不信任输入路径。
// 默认指针与配置引用以同一数据库视图读取。
func (s *Service) installation(ctx context.Context, id string) (Installation, error) {
	items, err := s.Repo.Installations(ctx, "")
	if err != nil {
		return Installation{}, err
	}
	for _, item := range items {
		if item.ID == id {
			return item, nil
		}
	}
	return Installation{}, Fail(404, "RESOURCE_NOT_FOUND", "安装实例不存在")
}

// existingTask 首先恢复已受理的幂等结果，再检查计划是否过期。
// 相同键不同 payload 一律拒绝，不复用看似相近的操作。
func (s *Service) existingTask(ctx context.Context, actor int64, key, fingerprint string) (Task, bool, error) {
	var stored, id string
	err := s.Repo.DB.QueryRow(ctx, "SELECT fingerprint,task_id FROM app.idempotency_records WHERE actor_id=$1 AND key=$2", actor, key).Scan(&stored, &id)
	if errors.Is(err, pgx.ErrNoRows) {
		return Task{}, false, nil
	}
	if err != nil {
		return Task{}, false, err
	}
	if stored != fingerprint {
		return Task{}, true, Fail(409, "IDEMPOTENCY_CONFLICT", "该幂等键已用于不同请求")
	}
	task, err := s.Repo.Task(ctx, id, actor)
	return task, true, err
}

// Accept 将计划消费、任务、输入、幂等、outbox 与审计原子提交。
// 耗时外部检查在事务前执行，worker 在实际副作用前再次检查。
func (s *Service) Accept(ctx context.Context, actor int64, key string, input Acceptance) (Task, error) {
	body, err := json.Marshal(input)
	if err != nil {
		return Task{}, err
	}
	fingerprint := sha256.Sum256(body)
	digest := hex.EncodeToString(fingerprint[:])
	if !validIdempotency(key) {
		return Task{}, Fail(422, "INVALID_INPUT", "必须提供稳定的 Idempotency-Key")
	}
	if task, exists, err := s.existingTask(ctx, actor, key, digest); exists || err != nil {
		return task, err
	}
	var encoded, encrypted []byte
	var consumed bool
	err = s.Repo.DB.QueryRow(ctx, "SELECT payload,encrypted_input,consumed FROM app.operation_plans WHERE id=$1 AND actor_id=$2", input.PlanID, actor).Scan(&encoded, &encrypted, &consumed)
	if errors.Is(err, pgx.ErrNoRows) {
		return Task{}, Fail(404, "RESOURCE_NOT_FOUND", "预检计划不存在")
	}
	if err != nil {
		return Task{}, err
	}
	var plan Plan
	if consumed {
		return Task{}, Fail(409, "PLAN_ALREADY_EXECUTED", "该计划已经产生任务，请查看任务列表")
	}
	if err = json.Unmarshal(encoded, &plan); err != nil {
		return Task{}, err
	}
	if time.Now().After(plan.ExpiresAt) || len(encrypted) == 0 {
		return Task{}, Fail(409, "PLAN_EXPIRED", "预检计划已过期")
	}
	if plan.ConfirmationText != nil && (input.ConfirmationText == nil || *input.ConfirmationText != *plan.ConfirmationText) {
		return Task{}, Fail(422, "CONFIRMATION_REQUIRED", "确认文本与预检目标不符")
	}
	plain, err := s.Vault.Open("plan:"+plan.ID, encrypted)
	if err != nil {
		return Task{}, err
	}
	var work Work
	if err = json.Unmarshal(plain, &work); err != nil {
		return Task{}, err
	}
	check, err := s.inspect(ctx, work)
	if err != nil {
		return Task{}, err
	}
	if !check.CanExecute {
		return Task{}, Fail(409, check.BlockedReasons[0].Code, check.BlockedReasons[0].Message)
	}
	return s.acceptWork(ctx, actor, key, digest, plan.ID, &plan, work)
}

// validIdempotency 为幂等键设定字符与大小上限。
// 它只是防重复凭据，不能代替认证。
func validIdempotency(key string) bool {
	if len(key) < 16 || len(key) > 128 {
		return false
	}
	for _, r := range key {
		if !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' || r == '_') {
			return false
		}
	}
	return true
}

// acceptWork 同时服务计划操作和目录刷新、日志导出任务。
// 所有队列共享一百个待执行任务的上限。
func (s *Service) acceptWork(ctx context.Context, actor int64, key, digest, planID string, plan *Plan, work Work) (Task, error) {
	if s.Draining() {
		return Task{}, Fail(503, "SERVICE_DRAINING", "服务正在排空")
	}
	tx, err := s.Repo.DB.Begin(ctx)
	if err != nil {
		return Task{}, err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(2026092902)"); err != nil {
		return Task{}, err
	}
	var stored, id string
	err = tx.QueryRow(ctx, "SELECT fingerprint,task_id FROM app.idempotency_records WHERE actor_id=$1 AND key=$2", actor, key).Scan(&stored, &id)
	if err == nil {
		if stored != digest {
			return Task{}, Fail(409, "IDEMPOTENCY_CONFLICT", "幂等键与已有请求不一致")
		}
		return decodeRow[Task](tx.QueryRow(ctx, "SELECT payload FROM app.tasks WHERE id=$1 AND actor_id=$2", id, actor))
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return Task{}, err
	}
	if planID != "" {
		var consumed bool
		var expires time.Time
		if err = tx.QueryRow(ctx, "SELECT consumed,expires_at FROM app.operation_plans WHERE id=$1 AND actor_id=$2 FOR UPDATE", planID, actor).Scan(&consumed, &expires); err != nil {
			return Task{}, err
		}
		if consumed {
			return Task{}, Fail(409, "PLAN_ALREADY_EXECUTED", "该计划已产生任务，请查看任务列表")
		}
		if time.Now().After(expires) {
			return Task{}, Fail(409, "PLAN_EXPIRED", "计划已过期，请重新预检")
		}
	}
	var count int
	if err = tx.QueryRow(ctx, "SELECT count(*) FROM app.tasks WHERE status IN ('queued','running')").Scan(&count); err != nil {
		return Task{}, err
	}
	if count >= 100 {
		return Task{}, Fail(429, "TASK_QUEUE_FULL", "任务队列已达到上限")
	}
	taskID, err := ID()
	if err != nil {
		return Task{}, err
	}
	task := Task{ID: taskID, Action: work.Operation.Action, ResourceIDs: []string{}, Status: "queued", Stage: "queued", Revision: 1, CanCancel: true, CreatedAt: time.Now().UTC()}
	if plan != nil {
		task.ResourceIDs = plan.ResourceIDs
	}
	taskBody, err := json.Marshal(task)
	if err != nil {
		return Task{}, err
	}
	plain, err := json.Marshal(work)
	if err != nil {
		return Task{}, err
	}
	sealed, err := s.Vault.Seal("task:"+taskID, plain)
	if err != nil {
		return Task{}, err
	}
	if _, err = tx.Exec(ctx, "INSERT INTO app.tasks(id,actor_id,plan_id,status,payload) VALUES($1,$2,NULLIF($3,''),'queued',$4)", task.ID, actor, planID, taskBody); err != nil {
		return Task{}, err
	}
	if _, err = tx.Exec(ctx, "INSERT INTO app.task_inputs(task_id,ciphertext) VALUES($1,$2)", task.ID, sealed); err != nil {
		return Task{}, err
	}
	if _, err = tx.Exec(ctx, "INSERT INTO app.idempotency_records(actor_id,key,fingerprint,task_id) VALUES($1,$2,$3,$4)", actor, key, digest, task.ID); err != nil {
		return Task{}, err
	}
	if planID != "" {
		if _, err = tx.Exec(ctx, "UPDATE app.operation_plans SET consumed=true,encrypted_input=NULL WHERE id=$1", planID); err != nil {
			return Task{}, err
		}
	}
	if err = outboxTask(ctx, tx, task, actor); err != nil {
		return Task{}, err
	}
	if err = auditTx(ctx, tx, actor, task.Action, "", task.ID, "accepted", "任务已持久受理"); err != nil {
		return Task{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Task{}, err
	}
	select {
	case s.wake <- struct{}{}:
	default:
	}
	return task, nil
}

// SubmitSimple 为无预检副作用的目录查询及导出保留持久幂等语义。
// 任意运行时或应用变更不能绕过计划使用该入口。
func (s *Service) SubmitSimple(ctx context.Context, actor int64, key string, work Work) (Task, error) {
	if !validIdempotency(key) || work.Operation.Action != "catalog.refresh" && work.Operation.Action != "logs.export" {
		return Task{}, Fail(422, "INVALID_INPUT", "任务请求无效")
	}
	if work.Operation.Action == "catalog.refresh" && work.Kind != "node" && work.Kind != "go" && work.Kind != "go,node" {
		return Task{}, Fail(422, "INVALID_INPUT", "运行时类别无效")
	}
	body, err := json.Marshal(work)
	if err != nil {
		return Task{}, err
	}
	sum := sha256.Sum256(body)
	digest := hex.EncodeToString(sum[:])
	if task, exists, err := s.existingTask(ctx, actor, key, digest); exists || err != nil {
		return task, err
	}
	return s.acceptWork(ctx, actor, key, digest, "", nil, work)
}

// validateRevision 在持有事务锁时阻止配置竞争覆盖。
// 只接受当前资源确切修订，不通过字符串排序判断新旧。
func validateRevision(actual int64, expected string) error {
	n, err := strconv.ParseInt(expected, 10, 64)
	if err != nil || n != actual {
		return Fail(409, "REVISION_CONFLICT", "资源配置已经改变")
	}
	return nil
}
