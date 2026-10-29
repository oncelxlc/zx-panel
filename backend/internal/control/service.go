package control

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5/pgxpool"
	"log/slog"
	"os"
	"runtime"
	"sync"
	"time"
	"zx-panel/internal/config"
	"zx-panel/internal/host"
)

// Service 持有单实例业务生命周期与共享采集器。
// 所有有副作用任务由独立于 HTTP 请求的 worker 执行。
type Service struct {
	Config        config.PanelConfig
	Repo          *Repository
	Metrics       *Collector
	Events        *EventHub
	Vault         *Vault
	Host          host.Client
	Version       string
	mu            sync.Mutex
	capabilities  Capabilities
	capabilityAt  time.Time
	runningID     string
	runningCancel context.CancelFunc
	appSamples    map[string]appSample
	wake          chan struct{}
	draining      bool
	wg            sync.WaitGroup
	cancel        context.CancelFunc
}

// appSample 保存 cgroup 差分基线与已核验状态。
// CPU 缺少连续样本时保持 null。
type appSample struct {
	At    time.Time
	State host.State
	CPU   *float64
}

// NewService 装配已有连接池和独立密钥，不创建账号或执行迁移。
// 启动检查失败时不会接受不完整的控制请求。
func NewService(cfg config.PanelConfig, db *pgxpool.Pool, vault *Vault, version string) (*Service, error) {
	events, err := NewEventHub()
	if err != nil {
		return nil, err
	}
	s := &Service{Config: cfg, Repo: &Repository{DB: db}, Metrics: NewCollector(cfg), Events: events, Vault: vault, Host: host.Client{Socket: cfg.Helper.SocketPath}, Version: version, appSamples: map[string]appSample{}, wake: make(chan struct{}, 1)}
	s.Metrics.Collect()
	return s, nil
}

// Start 在完成实例锁和迁移检查之后启动采集、outbox 与 worker。
// 原运行中任务先转为 interrupted，绝不自动重放副作用。
func (s *Service) Start(parent context.Context) error {
	if err := s.reconcileInstallations(parent); err != nil {
		return err
	}
	if err := s.recoverTasks(parent); err != nil {
		return err
	}
	if err := s.cleanAbandonedStaging(parent); err != nil {
		return err
	}
	ctx, cancel := context.WithCancel(parent)
	s.cancel = cancel
	for _, run := range []func(context.Context){s.collectLoop, s.outboxLoop, s.workerLoop, s.maintenanceLoop} {
		s.wg.Add(1)
		go func(fn func(context.Context)) { defer s.wg.Done(); fn(ctx) }(run)
	}
	return nil
}

// Close 停止受理并取消采集与可取消阶段，等待资源释放。
// 不可取消提交拥有自己的短期限，进程退出后未核验任务由恢复逻辑接管。
func (s *Service) Close() {
	s.mu.Lock()
	s.draining = true
	s.mu.Unlock()
	if s.cancel != nil {
		s.cancel()
	}
	s.Events.Close()
	s.wg.Wait()
}

// Draining 让 HTTP 和任务受理在排空开始后失败关闭。
// 普通只读请求可在服务器排空截止前完成。
func (s *Service) Draining() bool { s.mu.Lock(); defer s.mu.Unlock(); return s.draining }

// BeginDrain 禁止新任务并关闭长连接，让 HTTP 排空及时完成。
// Close 随后负责等待后台 worker。
func (s *Service) BeginDrain() { s.mu.Lock(); s.draining = true; s.mu.Unlock(); s.Events.Close() }

// Capabilities 将实测权限、平台和 helper 状态合并为明确能力。
// 前端能力仅作提示，每次写入仍执行同样的后端检查。
func (s *Service) Capabilities(ctx context.Context) Capabilities {
	s.mu.Lock()
	if time.Since(s.capabilityAt) < 5*time.Second {
		value := s.capabilities
		s.mu.Unlock()
		return value
	}
	s.mu.Unlock()
	on := Capability{Enabled: true}
	reason, message := "HELPER_UNAVAILABLE", "尚未启用可用的本机 helper"
	enabled := false
	info := s.Metrics.Info()
	if runtime.GOOS != "linux" {
		reason = "UNSUPPORTED_PLATFORM"
		message = "完整管理需要原生 Linux + systemd"
	} else if info.ObservationScope != "host" || info.AppSupervisor != "systemd" {
		reason = "UNSUPPORTED_ENVIRONMENT"
		message = "当前环境不是原生 systemd 主机"
	} else if s.Config.Helper.Enabled {
		check, cancel := context.WithTimeout(ctx, 2*time.Second)
		_, err := s.Host.Call(check, host.Request{Action: "probe"})
		cancel()
		enabled = err == nil
	}
	off := Capability{ReasonCode: &reason, Message: &message}
	write := off
	if enabled {
		write = on
	}
	read := on
	if runtime.GOOS != "linux" {
		read = off
	}
	value := Capabilities{ReadMetrics: read, InstallRuntime: write, ChangeRuntimeDefault: write, UninstallRuntime: write, ManageApps: write, ReadProcesses: read, ReadLogs: on, ExportLogs: on, EditSettings: on}
	s.mu.Lock()
	s.capabilities = value
	s.capabilityAt = time.Now()
	s.mu.Unlock()
	return value
}

// collectLoop 用同一采样服务所有浏览器，按各自周期聚合和观察应用。
// 数据库失联不把真实内存采样替换为示例数据。
func (s *Service) collectLoop(ctx context.Context) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	var aggregateAt, appsAt time.Time
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			snapshot := s.Metrics.Collect()
			if err := s.Events.Publish("metrics.sample", snapshot); err != nil {
				slog.Warn("metrics publish failed")
			}
			if time.Since(aggregateAt) >= 10*time.Second {
				bounded, cancel := context.WithTimeout(ctx, 4*time.Second)
				err := s.Metrics.PersistAggregate(bounded, s.Repo)
				cancel()
				if err != nil {
					slog.Warn("metrics aggregate persistence unavailable")
				}
				aggregateAt = time.Now()
			}
			if time.Since(appsAt) >= 5*time.Second {
				s.observeApps(ctx)
				appsAt = time.Now()
			}
		}
	}
}

// Record 保存有限的面板业务日志，不接受原始请求或秘密对象。
// 数据库不可用时仍由本机标准日志记录固定诊断。
func (s *Service) Record(ctx context.Context, level, message string) {
	if len(message) > 16<<10 {
		message = message[:16<<10]
	}
	bounded, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	if _, err := s.Repo.DB.Exec(bounded, "INSERT INTO app.panel_logs(level,message) VALUES($1,$2)", level, message); err != nil {
		slog.Warn("panel log persistence unavailable")
	}
}

// observeApps 读取 systemd 的 cgroup 汇总，不累加浏览器发现的零散 PID。
// 监督状态无法核实时明确变为 unknown。
func (s *Service) observeApps(ctx context.Context) {
	if !s.Config.Helper.Enabled {
		return
	}
	apps, err := s.Repo.Apps(ctx)
	if err != nil {
		return
	}
	seen := map[string]bool{}
	for _, app := range apps {
		if ctx.Err() != nil {
			return
		}
		seen[app.ID] = true
		bounded, cancel := context.WithTimeout(ctx, 2*time.Second)
		result, err := s.Host.Call(bounded, host.Request{Action: "app.status", ID: app.ID})
		cancel()
		now := time.Now()
		sample := appSample{At: now, State: host.State{Status: "unknown"}}
		s.mu.Lock()
		before := s.appSamples[app.ID]
		if err == nil && result.State != nil {
			sample.State = *result.State
			if before.State.CPUSeconds != nil && sample.State.CPUSeconds != nil && sample.State.MainPID == before.State.MainPID && *sample.State.CPUSeconds >= *before.State.CPUSeconds && now.Sub(before.At) > 0 && now.Sub(before.At) < 30*time.Second {
				cpu := 100 * (*sample.State.CPUSeconds - *before.State.CPUSeconds) / now.Sub(before.At).Seconds()
				sample.CPU = &cpu
			}
		}
		s.appSamples[app.ID] = sample
		s.mu.Unlock()
		if before.State.Status != sample.State.Status {
			_ = s.Events.Publish("app.changed", map[string]string{"id": app.ID, "revision": app.Revision})
		}
	}
	s.mu.Lock()
	for id := range s.appSamples {
		if !seen[id] {
			delete(s.appSamples, id)
		}
	}
	s.mu.Unlock()
}

// Apps 将持久配置与共享监督快照合并，不在每个浏览器请求启动命令。
// 超过十五秒的状态失效，防止旧 running 冒充事实。
func (s *Service) Apps(ctx context.Context) ([]App, error) {
	apps, err := s.Repo.Apps(ctx)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range apps {
		sample, ok := s.appSamples[apps[i].ID]
		if !ok || time.Since(sample.At) > 15*time.Second {
			apps[i].Status = "unknown"
			apps[i].MainPID = nil
			apps[i].StartedAt = nil
			apps[i].CPUUsagePercent = nil
			apps[i].MemoryBytes = nil
			continue
		}
		apps[i].Status = sample.State.Status
		apps[i].CPUUsagePercent = sample.CPU
		apps[i].MemoryBytes = sample.State.MemoryBytes
		apps[i].StartedAt = sample.State.StartedAt
		if sample.State.MainPID > 0 {
			pid := sample.State.MainPID
			apps[i].MainPID = &pid
		} else {
			apps[i].MainPID = nil
		}
	}
	return apps, nil
}

// App 从共享列表中读取单个详情，保持列表和详情状态一致。
// 应用数量由登记上限限制为一百个。
func (s *Service) App(ctx context.Context, id string) (App, error) {
	apps, err := s.Apps(ctx)
	if err != nil {
		return App{}, err
	}
	for _, app := range apps {
		if app.ID == id {
			return app, nil
		}
	}
	return App{}, Fail(404, "RESOURCE_NOT_FOUND", "应用不存在")
}

// outboxLoop 轮询持久未发送记录，通知丢失不会丢业务状态。
// 发布和标记之间崩溃可能重复，前端依据资源 revision 去重。
func (s *Service) outboxLoop(ctx context.Context) {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			rows, err := s.Repo.DB.Query(ctx, "SELECT id,event_name,payload,COALESCE(actor_id,0) FROM app.event_outbox WHERE published_at IS NULL ORDER BY id LIMIT 100")
			if err != nil {
				continue
			}
			type pendingEvent struct {
				id, actor int64
				name      string
				body      json.RawMessage
			}
			events := []pendingEvent{}
			for rows.Next() {
				var event pendingEvent
				if err = rows.Scan(&event.id, &event.name, &event.body, &event.actor); err != nil {
					break
				}
				events = append(events, event)
			}
			readErr := rows.Err()
			rows.Close()
			if err != nil || readErr != nil {
				continue
			}
			for _, event := range events {
				if err = s.Events.PublishForActor(event.name, event.body, event.actor); err != nil {
					break
				}
				if _, err = s.Repo.DB.Exec(ctx, "UPDATE app.event_outbox SET published_at=now() WHERE id=$1", event.id); err != nil {
					break
				}
			}
		}
	}
}

// maintenanceLoop 定期清理过期临时数据与有限历史。
// 任一清理失败仅记录固定诊断，不删除活动任务。
func (s *Service) maintenanceLoop(ctx context.Context) {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		// 启动后立即探测，后续各浏览器共享每分钟的安装快照。
		bounded, cancel := context.WithTimeout(ctx, 30*time.Second)
		if err := s.DiscoverExternal(bounded); err != nil && !errors.Is(err, context.Canceled) {
			slog.Warn("external runtime observation failed")
		}
		cancel()
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := s.cleanup(ctx); err != nil && !errors.Is(err, context.Canceled) {
				slog.Warn("panel retention cleanup failed")
			}
			slog.Debug("panel resource sample", "goroutines", runtime.NumGoroutine())
		}
	}
}

// cleanup 清除已过期的秘密输入并按保留设置裁剪历史。
// 活动任务、安装与应用配置不进入清理条件。
func (s *Service) cleanup(ctx context.Context) error {
	settings, err := s.Settings(ctx)
	if err != nil {
		return err
	}
	tx, err := s.Repo.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	statements := []struct {
		sql  string
		args []any
	}{{"DELETE FROM app.preauth_sessions WHERE expires_at<now()", nil}, {"DELETE FROM app.setup_tokens WHERE expires_at<now()", nil}, {"DELETE FROM app.user_sessions WHERE expires_at<now() OR last_seen_at<now()-interval '30 minutes'", nil}, {"UPDATE app.operation_plans SET encrypted_input=NULL WHERE expires_at<now()", nil}, {"DELETE FROM app.idempotency_records WHERE created_at<now()-interval '24 hours'", nil}, {"DELETE FROM app.event_outbox WHERE published_at<now()-interval '1 day'", nil}, {"DELETE FROM app.metrics_aggregates WHERE at<now()-make_interval(hours=>$1)", []any{settings.MetricsRetentionHours}}, {"DELETE FROM app.audit_events WHERE at<now()-make_interval(days=>$1)", []any{settings.AuditRetentionDays}}, {"DELETE FROM app.tasks t WHERE status NOT IN ('queued','running') AND created_at<now()-make_interval(days=>$1) AND NOT EXISTS(SELECT 1 FROM app.idempotency_records i WHERE i.task_id=t.id)", []any{settings.TaskRetentionDays}}, {"DELETE FROM app.operation_plans p WHERE expires_at<now()-interval '1 day' AND NOT EXISTS(SELECT 1 FROM app.tasks t WHERE t.plan_id=p.id)", nil}, {"DELETE FROM app.panel_logs WHERE at<now()-interval '7 days' OR id<(SELECT COALESCE(max(id),0)-50000 FROM app.panel_logs)", nil}}
	for _, statement := range statements {
		if _, err = tx.Exec(ctx, statement.sql, statement.args...); err != nil {
			return err
		}
	}
	var size int64
	if err = tx.QueryRow(ctx, "SELECT pg_total_relation_size('app.metrics_aggregates')").Scan(&size); err != nil {
		return err
	}
	if size > 128<<20 {
		if _, err = tx.Exec(ctx, "DELETE FROM app.metrics_aggregates WHERE (metric,device_id,at) IN (SELECT metric,device_id,at FROM app.metrics_aggregates ORDER BY at LIMIT 20000)"); err != nil {
			return err
		}
		if err = auditTx(ctx, tx, 0, "retention.metrics", "", "", "succeeded", "监控聚合达到配额，已裁剪最旧记录"); err != nil {
			return err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return err
	}
	rows, err := s.Repo.DB.Query(ctx, "SELECT id FROM app.log_exports WHERE expires_at<now()")
	if err != nil {
		return err
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			break
		}
		ids = append(ids, id)
	}
	readErr := rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	if readErr != nil {
		return readErr
	}
	root, err := os.OpenRoot(s.Config.Paths.ExportRoot)
	if err != nil {
		return err
	}
	defer root.Close()
	for _, id := range ids {
		if !resourcePattern.MatchString(id) {
			continue
		}
		if err = root.Remove(id + ".log"); err != nil && !os.IsNotExist(err) {
			return err
		}
		if _, err = s.Repo.DB.Exec(ctx, "DELETE FROM app.log_exports WHERE id=$1", id); err != nil {
			return err
		}
	}
	return nil
}
