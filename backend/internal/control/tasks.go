package control

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"os"
	"path/filepath"
	"strings"
	"time"
	"zx-panel/internal/host"
)

// outboxTask 把完整任务快照与修订写入同一业务事务。
// 内存广播失败不会让数据库任务永久失去通知。
func outboxTask(ctx context.Context, tx pgx.Tx, task Task, actor int64) error {
	body, err := json.Marshal(task)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, "INSERT INTO app.event_outbox(resource_id,revision,event_name,payload,actor_id) VALUES($1,$2,'task.updated',$3,$4) ON CONFLICT DO NOTHING", task.ID, task.Revision, body, actor)
	return err
}

// persistTask 更新行、阶段日志与 outbox，必须在已锁定任务的事务内调用。
// 终态删除加密工作输入，避免秘密不必要地长期保留。
func persistTask(ctx context.Context, tx pgx.Tx, task Task, actor int64, message string) error {
	body, err := json.Marshal(task)
	if err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "UPDATE app.tasks SET status=$2,revision=$3,payload=$4 WHERE id=$1", task.ID, task.Status, task.Revision, body); err != nil {
		return err
	}
	if message != "" {
		if _, err = tx.Exec(ctx, "INSERT INTO app.task_logs(task_id,level,message) SELECT $1,$2,$3 WHERE (SELECT count(*) FROM app.task_logs WHERE task_id=$1)<5000", task.ID, "info", message); err != nil {
			return err
		}
	}
	if task.Status != "queued" && task.Status != "running" {
		if _, err = tx.Exec(ctx, "DELETE FROM app.task_inputs WHERE task_id=$1", task.ID); err != nil {
			return err
		}
		if err = auditTx(ctx, tx, actor, task.Action, "", task.ID, task.Status, "任务已进入终态"); err != nil {
			return err
		}
	}
	return outboxTask(ctx, tx, task, actor)
}

// mutateTask 使用行锁合并状态，防止阶段更新覆盖并发取消请求。
// 调用函数不能在事务中执行网络或主机操作。
func (s *Service) mutateTask(ctx context.Context, id string, actor int64, change func(*Task) error, message string) (Task, error) {
	tx, err := s.Repo.DB.Begin(ctx)
	if err != nil {
		return Task{}, err
	}
	defer tx.Rollback(ctx)
	var body []byte
	var owner int64
	err = tx.QueryRow(ctx, "SELECT payload,actor_id FROM app.tasks WHERE id=$1 AND ($2=0 OR actor_id=$2) FOR UPDATE", id, actor).Scan(&body, &owner)
	if errors.Is(err, pgx.ErrNoRows) {
		return Task{}, Fail(404, "RESOURCE_NOT_FOUND", "任务不存在")
	}
	if err != nil {
		return Task{}, err
	}
	var task Task
	if err = json.Unmarshal(body, &task); err != nil {
		return task, err
	}
	if err = change(&task); err != nil {
		return task, err
	}
	task.Revision++
	if err = persistTask(ctx, tx, task, owner, message); err != nil {
		return task, err
	}
	return task, tx.Commit(ctx)
}

// taskStage 持久更新真实阶段，非下载阶段不制造虚拟百分比。
// 进入不可取消阶段之前先检查已收到的取消请求。
func (s *Service) taskStage(ctx context.Context, task *Task, stage string, cancelable bool, completed, total *int64) error {
	message := ""
	if task.Stage != stage {
		message = "进入阶段：" + stage
	}
	result, err := s.mutateTask(ctx, task.ID, 0, func(current *Task) error {
		if current.Status != "running" {
			return Fail(409, "TASK_NOT_RUNNING", "任务不在执行中")
		}
		if current.CancelRequestedAt != nil && current.CanCancel {
			return context.Canceled
		}
		current.Stage = stage
		current.CanCancel = cancelable
		current.Progress = Progress{CompletedBytes: completed, TotalBytes: total}
		return nil
	}, message)
	if err == nil {
		*task = result
	}
	return err
}

// CancelTask 仅允许尚未进入不可逆提交的阶段接收取消。
// 排队任务直接终结，运行任务由 worker 在安全边界停止。
func (s *Service) CancelTask(ctx context.Context, actor int64, id string) (Task, error) {
	task, err := s.mutateTask(ctx, id, actor, func(task *Task) error {
		if !task.CanCancel || task.Status != "queued" && task.Status != "running" {
			return Fail(409, "TASK_NOT_CANCELABLE", "当前任务不能取消")
		}
		now := time.Now().UTC()
		task.CancelRequestedAt = &now
		if task.Status == "queued" {
			task.Status = "canceled"
			task.Stage = "finished"
			task.FinishedAt = &now
			task.CanCancel = false
		}
		return nil
	}, "已收到取消请求")
	if err != nil {
		return task, err
	}
	s.mu.Lock()
	if s.runningID == id && s.runningCancel != nil {
		s.runningCancel()
	}
	s.mu.Unlock()
	return task, nil
}

// recoverTasks 将重启前运行任务标为 interrupted，不猜测副作用成功。
// 已提交资源由列表真实扫描与结果说明继续核对，原任务不自动重试。
func (s *Service) recoverTasks(ctx context.Context) error {
	tasks, err := listJSON[Task](ctx, s.Repo.DB, "SELECT payload FROM app.tasks WHERE status='running'")
	if err != nil {
		return err
	}
	for _, task := range tasks {
		result, proven := s.recoverInstallTask(ctx, task)
		_, err = s.mutateTask(ctx, task.ID, 0, func(current *Task) error {
			now := time.Now().UTC()
			current.Status = "interrupted"
			current.CanCancel = false
			current.FinishedAt = &now
			current.Error = &TaskError{Code: "SERVICE_INTERRUPTED", Message: "服务在核验结束前停止；请核对实际资源后重新预检", Recoverable: true}
			if result != nil {
				current.Result = result
			}
			if proven {
				current.Status = "succeeded"
				current.Error = nil
				current.Stage = "finished"
			}
			return nil
		}, "服务恢复：保留实际资源，未重放中断操作")
		if err != nil {
			return err
		}
	}
	return nil
}

// claimTask 使用条件行锁认领一条持久任务。
// 通知只是唤醒优化，即使通知丢失也会轮询队列。
func (s *Service) claimTask(ctx context.Context) (Task, int64, bool, error) {
	tx, err := s.Repo.DB.Begin(ctx)
	if err != nil {
		return Task{}, 0, false, err
	}
	defer tx.Rollback(ctx)
	var body []byte
	var actor int64
	err = tx.QueryRow(ctx, "SELECT payload,actor_id FROM app.tasks WHERE status='queued' ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1").Scan(&body, &actor)
	if errors.Is(err, pgx.ErrNoRows) {
		return Task{}, 0, false, nil
	}
	if err != nil {
		return Task{}, 0, false, err
	}
	var task Task
	if err = json.Unmarshal(body, &task); err != nil {
		return task, actor, false, err
	}
	task.Status = "running"
	task.Stage = "preflight"
	task.Revision++
	now := time.Now().UTC()
	task.StartedAt = &now
	if err = persistTask(ctx, tx, task, actor, "开始执行前重新核对资源与权限"); err != nil {
		return task, actor, false, err
	}
	err = tx.Commit(ctx)
	return task, actor, err == nil, err
}

// workerLoop 串行执行本机资源变更，安装重任务并发始终为一。
// ponytail: 单 worker 同时覆盖应用与运行时引用互斥；需要吞吐时再按资源拆锁。
func (s *Service) workerLoop(ctx context.Context) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		case <-s.wake:
		}
		for ctx.Err() == nil {
			task, actor, found, err := s.claimTask(ctx)
			if err != nil || !found {
				break
			}
			s.executeTask(ctx, actor, task)
		}
	}
}

// executeTask 从独立输入恢复工作，并把失败与部分结果真实保存。
// 原 HTTP 请求取消或浏览器关闭不会取消该上下文。
func (s *Service) executeTask(parent context.Context, actor int64, task Task) {
	ctx, cancel := context.WithTimeout(parent, 20*time.Minute)
	s.mu.Lock()
	s.runningID = task.ID
	s.runningCancel = cancel
	s.mu.Unlock()
	defer func() { cancel(); s.mu.Lock(); s.runningID = ""; s.runningCancel = nil; s.mu.Unlock() }()
	var sealed []byte
	err := s.Repo.DB.QueryRow(ctx, "SELECT ciphertext FROM app.task_inputs WHERE task_id=$1", task.ID).Scan(&sealed)
	var work Work
	if err == nil {
		var plain []byte
		plain, err = s.Vault.Open("task:"+task.ID, sealed)
		if err == nil {
			err = json.Unmarshal(plain, &work)
		}
	}
	if err == nil {
		var authorized bool
		err = s.Repo.DB.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM app.users WHERE id=$1 AND enabled AND role='admin')", actor).Scan(&authorized)
		if err == nil && !authorized {
			err = Fail(403, "FORBIDDEN", "操作人权限已失效")
		}
	}
	if err == nil && work.Operation.Action != "catalog.refresh" && work.Operation.Action != "logs.export" {
		var plan Plan
		plan, err = s.inspect(ctx, work)
		if err == nil && !plan.CanExecute {
			err = Fail(409, plan.BlockedReasons[0].Code, plan.BlockedReasons[0].Message)
		}
	}
	if err == nil {
		switch work.Operation.Action {
		case "catalog.refresh":
			err = s.taskStage(ctx, &task, "catalog", true, nil, nil)
			if err == nil {
				completed := []string{}
				for _, kind := range strings.Split(work.Kind, ",") {
					if err = s.RefreshCatalog(ctx, kind); err != nil {
						break
					}
					completed = append(completed, kind)
				}
				task.Result = map[string]any{"checkedKinds": completed}
			}
		case "logs.export":
			err = s.exportLogs(ctx, actor, &task, work.Logs)
		case "runtime.install":
			err = s.installRuntime(ctx, &task, work)
		case "runtime.set-default":
			err = s.setDefault(ctx, &task, work.Operation)
		case "runtime.uninstall":
			err = s.uninstallRuntime(ctx, &task, work.Operation)
		default:
			err = s.changeApp(ctx, &task, work.Operation)
		}
	}
	finishCtx, finishCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer finishCancel()
	result := task.Result
	_, finishErr := s.mutateTask(finishCtx, task.ID, 0, func(current *Task) error {
		now := time.Now().UTC()
		current.FinishedAt = &now
		current.CanCancel = false
		current.Result = result
		current.Stage = "finished"
		if err == nil {
			current.Status = "succeeded"
			current.Error = nil
			return nil
		}
		current.Status = "failed"
		code, message := "OPERATION_FAILED", "操作未完成，请查看阶段日志并核对实际资源"
		var fault *Fault
		if errors.As(err, &fault) {
			code, message = fault.Code, fault.Message
		}
		if errors.Is(err, context.Canceled) && current.CancelRequestedAt != nil {
			current.Status = "canceled"
			code = "TASK_CANCELED"
			message = "任务已在安全阶段取消"
		} else if parent.Err() != nil {
			current.Status = "interrupted"
			code = "SERVICE_INTERRUPTED"
			message = "服务正在排空，未完成任务需要重新核对"
		}
		current.Error = &TaskError{Code: code, Message: message, Recoverable: true}
		return nil
	}, "执行结束，结果以任务终态和资源核验为准")
	if finishErr != nil {
		s.Record(context.Background(), "error", "任务终态暂未持久化，重启后将执行中断恢复")
	}
	root, rootErr := os.OpenRoot(s.Config.Paths.StagingRoot)
	if rootErr == nil {
		if cleanupErr := root.RemoveAll(task.ID); cleanupErr != nil {
			s.Record(context.Background(), "warn", "任务暂存目录清理失败")
		}
		root.Close()
	}
	s.observeApps(finishCtx)
}

// installRuntime 先下载与验证，再进入不可取消的 root helper 提交。
// 数据库登记与默认指针同事务，安装完成但默认失败通过结果明确表达。
func (s *Service) installRuntime(ctx context.Context, task *Task, work Work) error {
	if work.Artifact == nil {
		return errors.New("artifact unavailable")
	}
	artifact := *work.Artifact
	if err := s.taskStage(ctx, task, "download", true, nil, nil); err != nil {
		return err
	}
	if _, err := s.downloadArtifact(ctx, task, artifact); err != nil {
		return err
	}
	if err := s.taskStage(ctx, task, "commit", false, nil, nil); err != nil {
		return err
	}
	commit, cancel := context.WithTimeout(context.WithoutCancel(ctx), 2*time.Minute)
	defer cancel()
	result, err := s.Host.Call(commit, host.Request{Action: "runtime.commit", ID: task.ID, StageID: task.ID, Kind: artifact.Release.Kind, Version: artifact.Release.Version, SHA256: artifact.SHA256, ArchiveRoot: artifact.ArchiveRoot})
	if err != nil {
		return Fail(503, "RUNTIME_VERIFY_FAILED", "helper 未确认运行时安装成功")
	}
	task.Result = map[string]any{"installationId": task.ID, "installed": true, "defaultChanged": false}
	now := time.Now().UTC()
	item := Installation{ID: task.ID, Kind: artifact.Release.Kind, Version: artifact.Release.Version, Architecture: s.Metrics.Info().Architecture, Path: result.Path, Ownership: "panel", State: "ready", InstalledAt: &now, Revision: "1"}
	body, err := json.Marshal(item)
	if err != nil {
		return err
	}
	tx, err := s.Repo.DB.Begin(commit)
	if err != nil {
		return err
	}
	defer tx.Rollback(commit)
	if _, err = tx.Exec(commit, "INSERT INTO app.runtime_installations(id,kind,path,payload) VALUES($1,$2,$3,$4)", item.ID, item.Kind, item.Path, body); err != nil {
		return err
	}
	if work.Operation.MakeDefault != nil && *work.Operation.MakeDefault {
		if _, err = tx.Exec(commit, "UPDATE app.runtime_installations SET revision=revision+1 WHERE id IN (SELECT installation_id FROM app.runtime_defaults WHERE kind=$1)", item.Kind); err != nil {
			return err
		}
		if _, err = tx.Exec(commit, "INSERT INTO app.runtime_defaults(kind,installation_id) VALUES($1,$2) ON CONFLICT(kind) DO UPDATE SET installation_id=EXCLUDED.installation_id", item.Kind, item.ID); err != nil {
			return err
		}
	}
	if err = tx.Commit(commit); err != nil {
		return err
	}
	task.Result["registered"] = true
	task.Result["defaultChanged"] = work.Operation.MakeDefault != nil && *work.Operation.MakeDefault
	return s.Events.Publish("runtime.changed", map[string]string{"kind": item.Kind, "id": item.ID})
}

// setDefault 只改变面板的新应用预选，不修改 PATH 或已有应用绑定。
// 默认指针变化同时推进相关安装修订。
func (s *Service) setDefault(ctx context.Context, task *Task, op Operation) error {
	if err := s.taskStage(ctx, task, "commit", false, nil, nil); err != nil {
		return err
	}
	commit, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
	defer cancel()
	ctx = commit
	tx, err := s.Repo.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var kind string
	var revision int64
	var body []byte
	if err = tx.QueryRow(ctx, "SELECT kind,revision,payload FROM app.runtime_installations WHERE id=$1 FOR UPDATE", op.InstallationID).Scan(&kind, &revision, &body); err != nil {
		return err
	}
	if err = validateRevision(revision, op.ExpectedRevision); err != nil {
		return err
	}
	var installation Installation
	if err = json.Unmarshal(body, &installation); err != nil {
		return err
	}
	if installation.Ownership != "panel" || installation.State != "ready" {
		return Fail(409, "INSTALLATION_NOT_READY", "只能选择可用的面板安装")
	}
	if _, err = tx.Exec(ctx, "UPDATE app.runtime_installations SET revision=revision+1 WHERE id=$1 OR id IN (SELECT installation_id FROM app.runtime_defaults WHERE kind=$2)", op.InstallationID, kind); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "INSERT INTO app.runtime_defaults(kind,installation_id) VALUES($1,$2) ON CONFLICT(kind) DO UPDATE SET installation_id=EXCLUDED.installation_id", kind, op.InstallationID); err != nil {
		return err
	}
	if err = tx.Commit(ctx); err != nil {
		return err
	}
	task.Result = map[string]any{"installationId": op.InstallationID, "defaultChanged": true}
	return s.Events.Publish("runtime.changed", map[string]string{"kind": kind})
}

// uninstallRuntime 在单 worker 引用互斥范围内删除面板目录，再删除登记。
// 外部安装、默认值及运行或配置引用都已在执行前重新阻止。
func (s *Service) uninstallRuntime(ctx context.Context, task *Task, op Operation) error {
	installation, err := s.installation(ctx, op.InstallationID)
	if err != nil {
		return err
	}
	if installation.Ownership != "panel" || installation.IsPanelDefault || installation.ConfiguredAppRefs > 0 {
		return Fail(409, "RUNTIME_IN_USE", "安装仍被引用或并非面板所有")
	}
	if err = s.taskStage(ctx, task, "commit", false, nil, nil); err != nil {
		return err
	}
	commit, cancel := context.WithTimeout(context.WithoutCancel(ctx), time.Minute)
	defer cancel()
	if _, err = s.Host.Call(commit, host.Request{Action: "runtime.remove", ID: installation.ID, Kind: installation.Kind}); err != nil {
		return Fail(409, "REFERENCE_CHECK_INCOMPLETE", "helper 拒绝删除，请检查完整引用与目录状态")
	}
	task.Result = map[string]any{"installationId": installation.ID, "directoryRemoved": true}
	deleted, err := s.Repo.DB.Exec(commit, "DELETE FROM app.runtime_installations WHERE id=$1 AND revision=$2", installation.ID, op.ExpectedRevision)
	if err != nil {
		return err
	}
	if deleted.RowsAffected() != 1 {
		return Fail(409, "REVISION_MISMATCH", "目录已移除，但安装登记发生变化，需要核对")
	}
	task.Result["registrationRemoved"] = true
	return s.Events.Publish("runtime.changed", map[string]string{"kind": installation.Kind})
}

// taskLog 只记录固定阶段说明，不记录环境、命令参数或请求正文。
// 失败返回调用者，不能无声丢失关键阶段诊断。
func (s *Service) taskLog(ctx context.Context, id, message string) error {
	if len(message) > 16<<10 {
		return fmt.Errorf("task log message too large")
	}
	_, err := s.Repo.DB.Exec(ctx, "INSERT INTO app.task_logs(task_id,level,message) VALUES($1,'info',$2)", id, message)
	return err
}

// taskResourcePath 为任务生成的目录使用固定本机根目录。
// 仅供诊断和恢复使用，不接受浏览器提供的完整路径。
func (s *Service) taskResourcePath(task Task) string {
	if strings.HasPrefix(task.Action, "runtime.") {
		return filepath.Join(s.Config.Paths.StagingRoot, task.ID)
	}
	return ""
}
