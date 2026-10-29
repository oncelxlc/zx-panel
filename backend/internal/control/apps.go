package control

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"sort"
	"strconv"
	"time"
	"zx-panel/internal/host"
)

// changeApp 把保存配置与生命周期操作分开，所有动作经过持久任务。
// helper 结果未经核实之前不会宣称应用已运行。
func (s *Service) changeApp(ctx context.Context, task *Task, op Operation) error {
	if err := s.taskStage(ctx, task, "commit", false, nil, nil); err != nil {
		return err
	}
	commit, cancel := context.WithTimeout(context.WithoutCancel(ctx), 2*time.Minute)
	defer cancel()
	if op.Action == "app.create" || op.Action == "app.update" {
		if op.App == nil {
			return errors.New("application input missing")
		}
		id := op.AppID
		if op.Action == "app.create" {
			id = task.ID
		}
		app, err := s.saveApp(commit, id, op)
		if err != nil {
			return err
		}
		task.Result = map[string]any{"appId": id, "configurationSaved": true, "unitUpdated": false, "restarted": false}
		definition, err := s.appDefinition(commit, app)
		if err != nil {
			return err
		}
		if _, err = s.Host.Call(commit, host.Request{Action: "app.write", ID: id, Definition: &definition}); err != nil {
			return Fail(503, "APP_CONFIG_PARTIAL", "配置已保存，helper 未完成 unit 更新；请重新保存配置")
		}
		task.Result["unitUpdated"] = true
		_ = s.Events.Publish("app.changed", map[string]string{"id": id})
		return s.taskLog(commit, task.ID, "配置已保存；未隐式启动或重启应用")
	}
	app, err := s.Repo.App(commit, op.AppID)
	if err != nil {
		return err
	}
	if app.Revision != op.ExpectedRevision {
		return Fail(409, "REVISION_CONFLICT", "应用已被修改")
	}
	if op.Action == "app.start" || op.Action == "app.restart" {
		definition, err := s.appDefinition(commit, app)
		if err != nil {
			return err
		}
		if _, err = s.Host.Call(commit, host.Request{Action: "app.write", ID: app.ID, Definition: &definition}); err != nil {
			return Fail(503, "APP_UNIT_UPDATE_FAILED", "启动前无法确认最新 unit 配置")
		}
	}
	result, err := s.Host.Call(commit, host.Request{Action: op.Action, ID: app.ID})
	if err != nil {
		return Fail(503, "APP_ACTION_FAILED", "helper 未确认应用操作完成")
	}
	if op.Action == "app.delete" {
		task.Result = map[string]any{"appId": app.ID, "unitRemoved": true, "filesPreserved": true, "logsPreserved": true}
		tag, err := s.Repo.DB.Exec(commit, "DELETE FROM app.managed_apps WHERE id=$1 AND revision=$2", app.ID, op.ExpectedRevision)
		if err != nil {
			return err
		}
		if tag.RowsAffected() != 1 {
			return Fail(409, "REVISION_CONFLICT", "unit 已移除，但应用登记修订已改变")
		}
		task.Result["registrationRemoved"] = true
		return s.Events.Publish("app.changed", map[string]string{"id": app.ID})
	}
	if result.State == nil {
		return Fail(503, "APP_STATE_UNAVAILABLE", "操作后未取得监督状态")
	}
	wanted := "running"
	if op.Action == "app.stop" {
		wanted = "stopped"
	}
	task.Result = map[string]any{"appId": app.ID, "status": result.State.Status}
	if result.State.Status != wanted {
		return Fail(503, "APP_VERIFY_FAILED", "systemd 状态尚未达到预期，请查看应用日志")
	}
	if op.Action == "app.start" || op.Action == "app.restart" {
		app.PendingRestart = false
	}
	app.Status = result.State.Status
	app.StartedAt = result.State.StartedAt
	app.MemoryBytes = result.State.MemoryBytes
	if result.State.MainPID > 0 {
		app.MainPID = &result.State.MainPID
	} else {
		app.MainPID = nil
	}
	revision, err := strconv.ParseInt(app.Revision, 10, 64)
	if err != nil {
		return err
	}
	app.Revision = Revision(revision + 1)
	body, err := json.Marshal(app)
	if err != nil {
		return err
	}
	tag, err := s.Repo.DB.Exec(commit, "UPDATE app.managed_apps SET revision=revision+1,payload=$2 WHERE id=$1 AND revision=$3", app.ID, body, revision)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return Fail(409, "REVISION_CONFLICT", "进程已执行操作，但配置修订改变")
	}
	s.mu.Lock()
	s.appSamples[app.ID] = appSample{At: time.Now(), State: *result.State}
	s.mu.Unlock()
	return s.Events.Publish("app.changed", map[string]string{"id": app.ID, "revision": app.Revision})
}

// saveApp 用同一事务保存非秘密配置与经过资源绑定加密的环境项。
// 配置持久化成功后才尝试更新 unit，失败会通过任务部分结果暴露。
func (s *Service) saveApp(ctx context.Context, id string, op Operation) (App, error) {
	draft := op.App
	tx, err := s.Repo.DB.Begin(ctx)
	if err != nil {
		return App{}, err
	}
	defer tx.Rollback(ctx)
	app := App{ID: id, Revision: "1", Name: draft.Name, WorkingDirectory: draft.WorkingDirectory, RunAsUser: draft.RunAsUser, Execution: draft.Execution, RestartPolicy: draft.RestartPolicy, UnitName: "zx-panel-app-" + id + ".service", Status: "stopped", EnvironmentKeys: []EnvironmentKey{}}
	var revision int64 = 1
	if op.Action == "app.update" {
		previous, err := decodeRow[App](tx.QueryRow(ctx, "SELECT payload FROM app.managed_apps WHERE id=$1 FOR UPDATE", id))
		if err != nil {
			return app, err
		}
		actual, err := strconv.ParseInt(previous.Revision, 10, 64)
		if err != nil {
			return app, err
		}
		if err = validateRevision(actual, op.ExpectedRevision); err != nil {
			return app, err
		}
		revision = actual + 1
		app.Revision = Revision(revision)
		app.PendingRestart = true
		app.Status = previous.Status
		app.MainPID = previous.MainPID
		app.StartedAt = previous.StartedAt
	}
	var runtimeID *string
	if app.Execution.Kind == "node" {
		runtimeID = &app.Execution.RuntimeInstallationID
		var ownership, state string
		if err = tx.QueryRow(ctx, "SELECT payload->>'ownership',payload->>'state' FROM app.runtime_installations WHERE id=$1 AND kind='node' FOR UPDATE", runtimeID).Scan(&ownership, &state); err != nil {
			return app, err
		}
		if ownership != "panel" || state != "ready" {
			return app, Fail(409, "INSTALLATION_NOT_READY", "绑定的运行时不再可用")
		}
	}
	body, err := json.Marshal(app)
	if err != nil {
		return app, err
	}
	if op.Action == "app.create" {
		if _, err = tx.Exec(ctx, "INSERT INTO app.managed_apps(id,name,runtime_id,revision,payload) VALUES($1,$2,$3,$4,$5)", app.ID, app.Name, runtimeID, revision, body); err != nil {
			return app, err
		}
	} else {
		if _, err = tx.Exec(ctx, "UPDATE app.managed_apps SET name=$2,runtime_id=$3,revision=$4,payload=$5 WHERE id=$1", app.ID, app.Name, runtimeID, revision, body); err != nil {
			return app, err
		}
	}
	for _, change := range op.EnvironmentChanges {
		if change.Action == "remove" {
			if _, err = tx.Exec(ctx, "DELETE FROM app.app_secrets WHERE app_id=$1 AND name=$2", app.ID, change.Key); err != nil {
				return app, err
			}
			continue
		}
		if change.Value == nil || change.Secret == nil {
			return app, Fail(422, "INVALID_INPUT", "环境值缺失")
		}
		sealed, err := s.Vault.Seal("environment:"+app.ID+":"+change.Key, []byte(*change.Value))
		if err != nil {
			return app, err
		}
		if _, err = tx.Exec(ctx, "INSERT INTO app.app_secrets(app_id,name,secret,ciphertext) VALUES($1,$2,$3,$4) ON CONFLICT(app_id,name) DO UPDATE SET secret=EXCLUDED.secret,ciphertext=EXCLUDED.ciphertext", app.ID, change.Key, *change.Secret, sealed); err != nil {
			return app, err
		}
	}
	rows, err := tx.Query(ctx, "SELECT name,secret FROM app.app_secrets WHERE app_id=$1 ORDER BY name", app.ID)
	if err != nil {
		return app, err
	}
	for rows.Next() {
		var key EnvironmentKey
		if err = rows.Scan(&key.Name, &key.Secret); err != nil {
			break
		}
		app.EnvironmentKeys = append(app.EnvironmentKeys, key)
	}
	readErr := rows.Err()
	rows.Close()
	if err != nil {
		return app, err
	}
	if readErr != nil {
		return app, readErr
	}
	if len(app.EnvironmentKeys) > 100 {
		return app, Fail(422, "INVALID_INPUT", "保存后环境变量超过 100 项")
	}
	var secretBytes int64
	if err = tx.QueryRow(ctx, "SELECT COALESCE(sum(octet_length(ciphertext)),0) FROM app.app_secrets WHERE app_id=$1", app.ID).Scan(&secretBytes); err != nil {
		return app, err
	}
	if secretBytes > 64<<10+int64(len(app.EnvironmentKeys)*(s.Vault.aead.NonceSize()+s.Vault.aead.Overhead())) {
		return app, Fail(422, "INVALID_INPUT", "保存后环境值总量超过 64 KiB")
	}
	body, err = json.Marshal(app)
	if err != nil {
		return app, err
	}
	if _, err = tx.Exec(ctx, "UPDATE app.managed_apps SET payload=$2 WHERE id=$1", app.ID, body); err != nil {
		return app, err
	}
	return app, tx.Commit(ctx)
}

// appDefinition 解密仅供 systemd 启动使用的环境，不回传客户端。
// 绑定的运行时始终使用具体安装路径而不是默认值或全局 PATH。
func (s *Service) appDefinition(ctx context.Context, app App) (host.Definition, error) {
	definition := host.Definition{ID: app.ID, Directory: app.WorkingDirectory, User: app.RunAsUser, Args: append([]string{}, app.Execution.Args...), Restart: app.RestartPolicy, Environment: map[string]string{}}
	if app.Execution.Kind == "node" {
		installation, err := s.installation(ctx, app.Execution.RuntimeInstallationID)
		if err != nil {
			return definition, err
		}
		if installation.Ownership != "panel" || installation.State != "ready" {
			return definition, Fail(409, "INSTALLATION_NOT_READY", "应用绑定的运行时不可用")
		}
		definition.Executable = filepath.Join(installation.Path, "bin", "node")
		definition.Args = append([]string{filepath.Join(app.WorkingDirectory, app.Execution.EntryFile)}, definition.Args...)
	} else {
		definition.Executable = app.Execution.ExecutablePath
	}
	rows, err := s.Repo.DB.Query(ctx, "SELECT name,ciphertext FROM app.app_secrets WHERE app_id=$1", app.ID)
	if err != nil {
		return definition, err
	}
	defer rows.Close()
	total := 0
	for rows.Next() {
		var name string
		var ciphertext []byte
		if err = rows.Scan(&name, &ciphertext); err != nil {
			return definition, err
		}
		plain, err := s.Vault.Open("environment:"+app.ID+":"+name, ciphertext)
		if err != nil {
			return definition, err
		}
		definition.Environment[name] = string(plain)
		total += len(plain)
	}
	if total > 64<<10 {
		return definition, Fail(422, "INVALID_INPUT", "环境变量总大小超过 64 KiB")
	}
	return definition, rows.Err()
}

// redactValues 在日志查询边界读取该应用秘密值，最长值优先替换。
// 查询失败时不继续输出未经脱敏的日志。
func (s *Service) redactValues(ctx context.Context, appID string) ([]string, error) {
	values := []string{}
	rows, err := s.Repo.DB.Query(ctx, "SELECT name,ciphertext FROM app.app_secrets WHERE app_id=$1 AND secret", appID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var name string
		var encrypted []byte
		if err = rows.Scan(&name, &encrypted); err != nil {
			return nil, err
		}
		plain, err := s.Vault.Open("environment:"+appID+":"+name, encrypted)
		if err != nil {
			return nil, err
		}
		if len(plain) > 0 {
			values = append(values, string(plain))
		}
	}
	sort.Slice(values, func(i, j int) bool { return len(values[i]) > len(values[j]) })
	return values, rows.Err()
}
