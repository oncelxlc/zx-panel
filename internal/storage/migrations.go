package storage

import (
	"context"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
	"time"
)

// migrationFiles 将审核后的 SQL 与程序一同发布。
// 校验值防止已执行迁移被悄悄改写。
//
//go:embed migrations/*.sql
var migrationFiles embed.FS

// migrationNames 明确保持发布迁移顺序，已经执行的 SQL 永不改写。
// 后续修改只能追加文件，校验每一个历史版本。
var migrationNames = []string{"001_panel.sql", "002_query_indexes.sql"}

// InstanceLockKey 隔离同一数据库中同一面板 schema 的主进程。
// 迁移与服务运行共用该锁，拒绝相互竞争。
const InstanceLockKey int64 = 0x7a782d70616e656c

// Pool 将连接池交给明确的业务仓储，不暴露给 HTTP Handler。
// 池的生命周期仍由 Postgres 所有者管理。
func (p *Postgres) Pool() *pgxpool.Pool { return p.pool }

// CheckSchema 检查当前 schema 是否与嵌入迁移一致。
// 生产启动不隐式执行 DDL。
func (p *Postgres) CheckSchema(ctx context.Context) error {
	rows, err := p.pool.Query(ctx, "SELECT version,checksum FROM app.schema_migrations ORDER BY version")
	if err != nil {
		return fmt.Errorf("schema unavailable; run migrate up before serve: %w", err)
	}
	defer rows.Close()
	count := 0
	for rows.Next() {
		var version int
		var digest string
		if err = rows.Scan(&version, &digest); err != nil {
			return err
		}
		if version != count+1 || count >= len(migrationNames) {
			return fmt.Errorf("unknown schema version")
		}
		sql, readErr := migrationFiles.ReadFile("migrations/" + migrationNames[count])
		if readErr != nil {
			return readErr
		}
		sum := sha256.Sum256(sql)
		if digest != hex.EncodeToString(sum[:]) {
			return fmt.Errorf("schema checksum mismatch at version %d", version)
		}
		count++
	}
	if err = rows.Err(); err != nil {
		return err
	}
	if count != len(migrationNames) {
		return fmt.Errorf("schema is behind; run migrate up before serve")
	}
	return nil
}

// MigratePanel 在单个事务中建立或升级面板 schema。
// 调用前需取得实例锁，已有账号密码摘要不会覆盖。
func (p *Postgres) MigratePanel(ctx context.Context) error {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "CREATE SCHEMA IF NOT EXISTS app; CREATE TABLE IF NOT EXISTS app.schema_migrations(version integer PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())"); err != nil {
		return err
	}
	var count int
	err = tx.QueryRow(ctx, "SELECT count(*) FROM app.schema_migrations").Scan(&count)
	if err != nil {
		return err
	}
	if count > len(migrationNames) {
		return fmt.Errorf("database schema is newer than this program")
	}
	for index, name := range migrationNames {
		sql, readErr := migrationFiles.ReadFile("migrations/" + name)
		if readErr != nil {
			return readErr
		}
		sum := sha256.Sum256(sql)
		digest := hex.EncodeToString(sum[:])
		version := index + 1
		if version <= count {
			var stored string
			if err = tx.QueryRow(ctx, "SELECT checksum FROM app.schema_migrations WHERE version=$1", version).Scan(&stored); err != nil {
				return err
			}
			if stored != digest {
				return fmt.Errorf("schema checksum mismatch at version %d", version)
			}
			continue
		}
		if _, err = tx.Exec(ctx, string(sql)); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, "INSERT INTO app.schema_migrations(version,checksum) VALUES($1,$2)", version, digest); err != nil {
			return err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return err
	}
	return p.CheckSchema(ctx)
}

// AcquireInstanceLock 保留专用数据库连接，保证锁不会被连接池回收。
// 连接丢失时服务必须停止受理和执行写任务。
func (p *Postgres) AcquireInstanceLock(ctx context.Context) (*pgxpool.Conn, error) {
	conn, err := p.pool.Acquire(ctx)
	if err != nil {
		return nil, err
	}
	var locked bool
	if err = conn.QueryRow(ctx, "SELECT pg_try_advisory_lock($1)", InstanceLockKey).Scan(&locked); err != nil || !locked {
		conn.Release()
		return nil, fmt.Errorf("panel database is already in use or unavailable")
	}
	return conn, nil
}

// ReleaseInstanceLock 在关闭 worker 后释放进程锁。
// 失败时关闭连接，避免带着会话锁回到池内。
func ReleaseInstanceLock(conn *pgxpool.Conn) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if _, err := conn.Exec(ctx, "SELECT pg_advisory_unlock($1)", InstanceLockKey); err != nil {
		_ = conn.Conn().Close(ctx)
	}
	conn.Release()
}
