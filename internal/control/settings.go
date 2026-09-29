package control

import (
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"strconv"
	"time"
)

// Settings 只公开面板偏好和容量摘要，不返回部署密钥或数据库地址。
// Revision 用于防止不同标签页互相覆盖。
type Settings struct {
	Revision              string `json:"revision"`
	DisplayTimezone       string `json:"displayTimezone"`
	MetricsRetentionHours int    `json:"metricsRetentionHours"`
	TaskRetentionDays     int    `json:"taskRetentionDays"`
	AuditRetentionDays    int    `json:"auditRetentionDays"`
	StorageBytes          int64  `json:"storageBytes"`
	RuntimeRoot           string `json:"runtimeRoot"`
	Version               string `json:"version"`
}

// SettingsChange 是设置接口唯一允许写入的字段。
// 路径和秘密仍由本机部署配置控制。
type SettingsChange struct {
	ExpectedRevision      string `json:"expectedRevision"`
	DisplayTimezone       string `json:"displayTimezone"`
	MetricsRetentionHours int    `json:"metricsRetentionHours"`
	TaskRetentionDays     int    `json:"taskRetentionDays"`
	AuditRetentionDays    int    `json:"auditRetentionDays"`
}

// Settings 获取配置和实际 PostgreSQL 监控表占用。
// 系统不为未收集的历史填充虚构数据。
func (s *Service) Settings(ctx context.Context) (Settings, error) {
	var result Settings
	var body []byte
	var revision int64
	var storageBytes int64
	if err := s.Repo.DB.QueryRow(ctx, "SELECT revision,payload,pg_total_relation_size('app.metrics_aggregates') FROM app.settings WHERE id=true").Scan(&revision, &body, &storageBytes); err != nil {
		return result, err
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return result, err
	}
	result.Revision = strconv.FormatInt(revision, 10)
	result.StorageBytes = storageBytes
	result.RuntimeRoot = s.Config.Paths.RuntimeRoot
	result.Version = s.Version
	return result, nil
}

// SaveSettings 在同一事务检查修订、更新设置并写审计。
// 校验时区但不修改主机时区。
func (s *Service) SaveSettings(ctx context.Context, actor int64, change SettingsChange) (Settings, error) {
	if change.DisplayTimezone != "server" && change.DisplayTimezone != "browser" {
		if _, err := time.LoadLocation(change.DisplayTimezone); err != nil || change.DisplayTimezone == "" {
			return Settings{}, Fail(422, "INVALID_INPUT", "显示时区无效")
		}
	}
	if change.MetricsRetentionHours < 1 || change.MetricsRetentionHours > 24 || change.TaskRetentionDays < 1 || change.TaskRetentionDays > 90 || change.AuditRetentionDays < 7 || change.AuditRetentionDays > 365 {
		return Settings{}, Fail(422, "INVALID_INPUT", "数据保留范围无效")
	}
	revision, err := strconv.ParseInt(change.ExpectedRevision, 10, 64)
	if err != nil {
		return Settings{}, Fail(422, "INVALID_INPUT", "修订号无效")
	}
	body, err := json.Marshal(Settings{DisplayTimezone: change.DisplayTimezone, MetricsRetentionHours: change.MetricsRetentionHours, TaskRetentionDays: change.TaskRetentionDays, AuditRetentionDays: change.AuditRetentionDays})
	if err != nil {
		return Settings{}, err
	}
	tx, err := s.Repo.DB.Begin(ctx)
	if err != nil {
		return Settings{}, err
	}
	defer tx.Rollback(ctx)
	tag, err := tx.Exec(ctx, "UPDATE app.settings SET payload=$1,revision=revision+1 WHERE id=true AND revision=$2", body, revision)
	if err != nil {
		return Settings{}, err
	}
	if tag.RowsAffected() != 1 {
		return Settings{}, Fail(409, "REVISION_CONFLICT", "设置已被其他请求修改")
	}
	if err = auditTx(ctx, tx, actor, "settings.update", "", "", "succeeded", "面板设置已更新"); err != nil {
		return Settings{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Settings{}, err
	}
	return s.Settings(ctx)
}

// auditTx 将结果审计与持久修改原子提交。
// 消息只允许业务静态说明，不写用户秘密值。
func auditTx(ctx context.Context, tx pgx.Tx, actor int64, action, resource, task, result, message string) error {
	_, err := tx.Exec(ctx, "INSERT INTO app.audit_events(actor_id,action,resource_id,task_id,result,message) VALUES(NULLIF($1,0),$2,NULLIF($3,''),NULLIF($4,''),$5,$6)", actor, action, resource, task, result, message)
	return err
}
