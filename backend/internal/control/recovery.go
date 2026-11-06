package control

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"time"
	"zx-panel/internal/host"
)

// taskDirectoryPattern 仅允许服务自己生成的随机任务目录进入恢复或清理。
// 一般 API 资源 ID 的宽字符集不能用于目录清理。
var taskDirectoryPattern = regexp.MustCompile(`^[a-f0-9]{32}$`)

// reconcileInstallations 扫描已提交目录，只有 helper 的 root 标记能恢复缺失登记。
// 不下载、不执行安装、不改默认指针；无法核实的登记不再显示为 ready。
func (s *Service) reconcileInstallations(ctx context.Context) error {
	if !s.Config.Helper.Enabled {
		return nil
	}
	bounded, cancel := context.WithTimeout(ctx, 2*time.Second)
	_, err := s.Host.Call(bounded, host.Request{Action: "probe"})
	cancel()
	if err != nil {
		s.Record(ctx, "warn", "启动资源核验未连接到 helper，安装状态暂不可核实")
		return nil
	}
	known, err := s.Repo.Installations(ctx, "")
	if err != nil {
		return err
	}
	seen := map[string]bool{}
	for _, kind := range []string{"node", "go"} {
		entries, err := os.ReadDir(filepath.Join(s.Config.Paths.RuntimeRoot, kind))
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			return err
		}
		for _, entry := range entries {
			if !entry.IsDir() || !taskDirectoryPattern.MatchString(entry.Name()) {
				continue
			}
			bounded, cancel := context.WithTimeout(ctx, 5*time.Second)
			result, err := s.Host.Call(bounded, host.Request{Action: "runtime.inspect", Kind: kind, ID: entry.Name()})
			cancel()
			if err != nil || result.Installation == nil {
				continue
			}
			evidence := result.Installation
			seen[evidence.ID] = true
			item := Installation{ID: evidence.ID, Kind: kind, Version: evidence.Version, Architecture: s.Metrics.Info().Architecture, Path: evidence.Path, Ownership: "panel", State: "ready", InstalledAt: &evidence.InstalledAt, Revision: "1"}
			body, err := json.Marshal(item)
			if err != nil {
				return err
			}
			if _, err = s.Repo.DB.Exec(ctx, "INSERT INTO app.runtime_installations(id,kind,path,payload) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET payload=jsonb_set(app.runtime_installations.payload,'{state}','\"ready\"'),revision=app.runtime_installations.revision+1 WHERE app.runtime_installations.payload->>'ownership'='panel' AND app.runtime_installations.payload->>'state'<>'ready'", item.ID, kind, item.Path, body); err != nil {
				return err
			}
		}
	}
	for _, item := range known {
		if item.Ownership != "panel" || seen[item.ID] {
			continue
		}
		state := "unknown"
		if _, err = os.Lstat(item.Path); os.IsNotExist(err) {
			state = "broken"
		}
		if _, err = s.Repo.DB.Exec(ctx, "UPDATE app.runtime_installations SET payload=jsonb_set(payload,'{state}',to_jsonb($2::text)),revision=revision+1 WHERE id=$1 AND payload->>'state'<>$2", item.ID, state); err != nil {
			return err
		}
	}
	return nil
}

// recoverInstallTask 结合加密任务输入、实际提交证据和数据库默认指针核实安装结果。
// 只恢复可证明的完成状态；部分成功保留结果而不补做默认切换。
func (s *Service) recoverInstallTask(ctx context.Context, task Task) (map[string]any, bool) {
	if task.Action != "runtime.install" || !s.Config.Helper.Enabled {
		return nil, false
	}
	var sealed []byte
	if err := s.Repo.DB.QueryRow(ctx, "SELECT ciphertext FROM app.task_inputs WHERE task_id=$1", task.ID).Scan(&sealed); err != nil {
		return nil, false
	}
	plain, err := s.Vault.Open("task:"+task.ID, sealed)
	if err != nil {
		return nil, false
	}
	var work Work
	if json.Unmarshal(plain, &work) != nil || work.Artifact == nil {
		return nil, false
	}
	bounded, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	response, err := s.Host.Call(bounded, host.Request{Action: "runtime.inspect", ID: task.ID, Kind: work.Artifact.Release.Kind})
	if err != nil || response.Installation == nil {
		return nil, false
	}
	proof := response.Installation
	if proof.SHA256 != work.Artifact.SHA256 || proof.Version != work.Artifact.Release.Version {
		return nil, false
	}
	item, err := s.installation(ctx, task.ID)
	registered := err == nil && item.Path == proof.Path && item.State == "ready"
	wantedDefault := work.Operation.MakeDefault != nil && *work.Operation.MakeDefault
	return map[string]any{"installationId": task.ID, "installed": true, "registered": registered, "defaultChanged": registered && wantedDefault && item.IsPanelDefault, "recovered": true}, registered && (!wantedDefault || item.IsPanelDefault)
}

// cleanAbandonedStaging 只清除已不再排队或运行的随机任务目录。
// 最终安装目录与其他文件从不进入这个清理根目录。
func (s *Service) cleanAbandonedStaging(ctx context.Context) error {
	root, err := os.OpenRoot(s.Config.Paths.StagingRoot)
	if err != nil {
		return err
	}
	defer root.Close()
	directory, err := root.Open(".")
	if err != nil {
		return err
	}
	entries, err := directory.ReadDir(-1)
	directory.Close()
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if !entry.IsDir() || !taskDirectoryPattern.MatchString(entry.Name()) {
			continue
		}
		var active bool
		if err = s.Repo.DB.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM app.tasks WHERE id=$1 AND status IN ('queued','running'))", entry.Name()).Scan(&active); err != nil {
			return err
		}
		if !active {
			if err = root.RemoveAll(entry.Name()); err != nil {
				return err
			}
		}
	}
	return nil
}
