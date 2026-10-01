package control

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"strconv"
	"strings"
	"time"
	"zx-panel/internal/host"
)

// RuntimeSummary 分开呈现安装事实与目录缓存状态。
// updateAvailable 只在确有较新目录版本时为真。
type RuntimeSummary struct {
	Kind             string     `json:"kind"`
	DefaultVersion   *string    `json:"defaultVersion"`
	PanelCount       int        `json:"panelCount"`
	ExternalCount    int        `json:"externalCount"`
	ExternalVersions []string   `json:"externalVersions"`
	CheckedAt        *time.Time `json:"checkedAt"`
	CacheState       string     `json:"cacheState"`
	UpdateAvailable  bool       `json:"updateAvailable"`
}

// RuntimeSummaries 汇总可管理类别与已发现的系统运行时。
// 安装数量与应用运行状态没有等价关系。
func (s *Service) RuntimeSummaries(ctx context.Context) ([]RuntimeSummary, error) {
	result := []RuntimeSummary{}
	for _, probe := range externalRuntimes {
		kind := probe.kind
		items, err := s.Repo.Installations(ctx, kind)
		if err != nil {
			return nil, err
		}
		managed := kind == "node" || kind == "go"
		if !managed && len(items) == 0 {
			continue
		}
		catalog := CatalogPage{CacheState: "unavailable"}
		if managed {
			catalog, err = s.Catalog(ctx, kind, 1, 0)
			if err != nil {
				return nil, err
			}
		}
		summary := RuntimeSummary{Kind: kind, CheckedAt: catalog.CheckedAt, CacheState: catalog.CacheState, ExternalVersions: []string{}}
		for _, item := range items {
			if item.Ownership == "panel" {
				summary.PanelCount++
			} else {
				summary.ExternalCount++
				if item.State == "ready" && !slices.Contains(summary.ExternalVersions, item.Version) {
					summary.ExternalVersions = append(summary.ExternalVersions, item.Version)
				}
			}
			if item.IsPanelDefault {
				version := item.Version
				summary.DefaultVersion = &version
			}
		}
		if summary.DefaultVersion != nil && len(catalog.Items) > 0 {
			summary.UpdateAvailable = newer(catalog.Items[0].Version, *summary.DefaultVersion)
		}
		result = append(result, summary)
	}
	return result, nil
}

// References 保留配置引用与观测检查的明确完整性。
// 非完整检查不能作为卸载许可。
type References struct {
	ConfiguredApps    []App     `json:"apps"`
	ObservedProcesses []Process `json:"processes"`
	Complete          bool      `json:"complete"`
	Reason            *string   `json:"reason"`
}

// References 查询配置关系与 helper 核实的进程引用数量。
// 返回进程清单只使用共享快照中可确认属于该安装的项。
func (s *Service) References(ctx context.Context, id string) (References, error) {
	result := References{ConfiguredApps: []App{}, ObservedProcesses: []Process{}}
	installation, err := s.installation(ctx, id)
	if err != nil {
		return result, err
	}
	apps, err := s.Repo.Apps(ctx)
	if err != nil {
		return result, err
	}
	for _, app := range apps {
		if app.Execution.RuntimeInstallationID == id {
			result.ConfiguredApps = append(result.ConfiguredApps, app)
		}
	}
	pids, complete := inspectProcessReferences(installation.Path)
	unitReferences := 0
	if installation.Ownership == "panel" && s.Config.Helper.Enabled {
		response, e := s.Host.Call(ctx, host.Request{Action: "runtime.references", ID: id, Kind: installation.Kind})
		if e == nil && response.References != nil {
			pids, complete = response.ProcessIDs, response.Complete
			unitReferences = *response.References - len(pids)
		} else {
			complete = false
		}
	}
	for _, pid := range pids {
		page, e := s.Metrics.Processes(strconv.Itoa(pid), "pid", "", 200)
		found := false
		if e == nil {
			for _, process := range page.Items {
				if process.PID == pid {
					result.ObservedProcesses = append(result.ObservedProcesses, process)
					found = true
					break
				}
			}
		}
		if !found {
			complete = false
		}
	}
	result.Complete = complete
	if !result.Complete {
		reason := "部分进程信息不可读或在扫描中变化；卸载检查将由 helper 再次执行"
		result.Reason = &reason
	} else if unitReferences > 0 {
		reason := "检测到 systemd unit 配置引用；卸载前需要解除绑定"
		result.Reason = &reason
	}
	return result, nil
}

// DiscoverExternal 保存系统位置与服务账号可访问工具链的只读安装事实。
// 可执行版本读取在非 root 主服务身份下运行；未再次发现的记录降为未知。
func (s *Service) DiscoverExternal(ctx context.Context) error {
	items, err := scanExternalRuntimes(ctx, s.Config.Paths.RuntimeRoot, externalRuntimePaths())
	if err != nil {
		return err
	}
	tx, err := s.Repo.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	observed := []string{}
	changed := false
	for _, item := range items {
		body, err := json.Marshal(item)
		if err != nil {
			return err
		}
		result, err := tx.Exec(ctx, "INSERT INTO app.runtime_installations(id,kind,path,payload) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,revision=app.runtime_installations.revision+1 WHERE app.runtime_installations.payload->>'ownership'='external' AND app.runtime_installations.payload IS DISTINCT FROM EXCLUDED.payload", item.ID, item.Kind, item.Path, body)
		if err != nil {
			return err
		}
		observed = append(observed, item.ID)
		changed = changed || result.RowsAffected() > 0
	}
	result, err := tx.Exec(ctx, `UPDATE app.runtime_installations SET payload=jsonb_set(payload,'{state}','"unknown"'),revision=revision+1 WHERE payload->>'ownership'='external' AND payload->>'state'<>'unknown' AND NOT (id=ANY($1::text[]))`, observed)
	if err != nil {
		return err
	}
	if err = tx.Commit(ctx); err != nil {
		return err
	}
	if changed || result.RowsAffected() > 0 {
		return s.Events.Publish("runtime.changed", map[string]string{"ownership": "external"})
	}
	return nil
}

// versionOutput 限制系统外部运行时版本探测输出，避免异常二进制耗尽内存。
// 子进程在写入超限时失败，错误正文不会进入 API。
type versionOutput struct{ strings.Builder }

// Write 对探测输出实施 4 KiB 上限，不保留超限消息。
// Run 的超时仍负责终止不能正常结束的子进程。
func (b *versionOutput) Write(p []byte) (int, error) {
	if b.Len()+len(p) > 4096 {
		return 0, errors.New("runtime version output too large")
	}
	return b.Builder.Write(p)
}
