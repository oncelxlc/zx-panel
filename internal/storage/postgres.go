package storage

import (
	"context"
	"errors"
	"fmt"
	"time"

	"zx-panel/internal/auth"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Postgres 封装项目 PostgreSQL 连接池和认证数据访问。
// 所有查询通过 pgx 参数化执行，避免业务层直接依赖驱动细节。
type Postgres struct {
	pool *pgxpool.Pool
}

// OpenPostgres 创建连接池并确认数据库可访问。
// Ping 失败时会立即关闭连接池并返回带上下文的启动错误。
func OpenPostgres(ctx context.Context, databaseURL string) (*Postgres, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("create postgres pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	return &Postgres{pool: pool}, nil
}

// Close 释放 PostgreSQL 连接池持有的全部资源。
// 服务退出时必须调用该方法避免连接泄漏。
func (p *Postgres) Close() {
	p.pool.Close()
}

// Migrate 创建基础用户表、会话表和必要索引。
// 所有 DDL 使用 IF NOT EXISTS，允许服务启动时安全重复执行。
func (p *Postgres) Migrate(ctx context.Context) error {
	const migration = `
CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.users (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username varchar(32) NOT NULL UNIQUE,
    display_name varchar(64) NOT NULL DEFAULT '',
    password_hash text NOT NULL,
    role varchar(32) NOT NULL DEFAULT 'user',
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app.user_sessions (
    token_hash bytea PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx ON app.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS user_sessions_expires_at_idx ON app.user_sessions(expires_at);
`
	if _, err := p.pool.Exec(ctx, migration); err != nil {
		return fmt.Errorf("migrate postgres: %w", err)
	}
	return nil
}

// CountUsers 返回系统用户总数。
// 认证服务使用该结果判断是否需要创建初始管理员。
func (p *Postgres) CountUsers(ctx context.Context) (int64, error) {
	var count int64
	if err := p.pool.QueryRow(ctx, `SELECT COUNT(*) FROM app.users`).Scan(&count); err != nil {
		return 0, fmt.Errorf("count users: %w", err)
	}
	return count, nil
}

// CreateUser 持久化基础用户并返回可公开信息。
// 密码摘要只写入数据库，不包含在返回的 User 结构中。
func (p *Postgres) CreateUser(ctx context.Context, username string, displayName string, role string, passwordHash string) (auth.User, error) {
	const query = `
INSERT INTO app.users (username, display_name, role, password_hash)
VALUES ($1, $2, $3, $4)
RETURNING id, username, display_name, role, enabled, created_at, updated_at`
	var user auth.User
	if err := p.pool.QueryRow(ctx, query, username, displayName, role, passwordHash).Scan(
		&user.ID,
		&user.Username,
		&user.DisplayName,
		&user.Role,
		&user.Enabled,
		&user.CreatedAt,
		&user.UpdatedAt,
	); err != nil {
		return auth.User{}, fmt.Errorf("insert user: %w", err)
	}
	return user, nil
}

// FindUserByUsername 查询账号及密码摘要。
// 用户输入始终通过参数化 SQL 传入，未命中时返回领域哨兵错误。
func (p *Postgres) FindUserByUsername(ctx context.Context, username string) (auth.UserCredential, error) {
	const query = `
SELECT id, username, display_name, role, enabled, created_at, updated_at, password_hash
FROM app.users
WHERE username = $1`
	var credential auth.UserCredential
	if err := p.pool.QueryRow(ctx, query, username).Scan(
		&credential.ID,
		&credential.Username,
		&credential.DisplayName,
		&credential.Role,
		&credential.Enabled,
		&credential.CreatedAt,
		&credential.UpdatedAt,
		&credential.PasswordHash,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return auth.UserCredential{}, auth.ErrUserNotFound
		}
		return auth.UserCredential{}, fmt.Errorf("select user: %w", err)
	}
	return credential, nil
}

// CreateSession 保存会话令牌摘要与过期时间。
// 明文令牌不会进入数据库，降低存储泄露后的直接冒用风险。
func (p *Postgres) CreateSession(ctx context.Context, tokenHash []byte, userID int64, expiresAt time.Time) error {
	if _, err := p.pool.Exec(ctx, `INSERT INTO app.user_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`, tokenHash, userID, expiresAt); err != nil {
		return fmt.Errorf("insert user session: %w", err)
	}
	return nil
}

// FindUserBySession 校验会话有效性并返回关联用户。
// 查询同时限制过期时间和用户启用状态，任一不满足均视为未找到。
func (p *Postgres) FindUserBySession(ctx context.Context, tokenHash []byte, now time.Time) (auth.User, error) {
	const query = `
SELECT u.id, u.username, u.display_name, u.role, u.enabled, u.created_at, u.updated_at
FROM app.user_sessions AS s
JOIN app.users AS u ON u.id = s.user_id
WHERE s.token_hash = $1 AND s.expires_at > $2 AND u.enabled = true`
	var user auth.User
	if err := p.pool.QueryRow(ctx, query, tokenHash, now).Scan(
		&user.ID,
		&user.Username,
		&user.DisplayName,
		&user.Role,
		&user.Enabled,
		&user.CreatedAt,
		&user.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return auth.User{}, auth.ErrUserNotFound
		}
		return auth.User{}, fmt.Errorf("select user session: %w", err)
	}
	return user, nil
}

// DeleteSession 删除指定会话摘要。
// SQL DELETE 天然保持幂等，不存在的会话仍视为注销成功。
func (p *Postgres) DeleteSession(ctx context.Context, tokenHash []byte) error {
	if _, err := p.pool.Exec(ctx, `DELETE FROM app.user_sessions WHERE token_hash = $1`, tokenHash); err != nil {
		return fmt.Errorf("delete user session: %w", err)
	}
	return nil
}
