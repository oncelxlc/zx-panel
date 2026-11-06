package storage

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"time"
	"zx-panel/internal/auth"
)

// MarkCookieSession 将新会话限制为 Cookie 专用。
// 升级前 Bearer 会话不能被接受。
func (p *Postgres) MarkCookieSession(ctx context.Context, hash []byte) error {
	_, err := p.pool.Exec(ctx, "UPDATE app.user_sessions SET cookie_session=true,last_seen_at=now() WHERE token_hash=$1", hash)
	return err
}

// CookieUser 检查绝对过期、空闲过期与账号状态。
// 被动流校验不会无限延长空闲会话。
func (p *Postgres) CookieUser(ctx context.Context, hash []byte, touch bool) (auth.User, time.Time, error) {
	var user auth.User
	var expiry time.Time
	err := p.pool.QueryRow(ctx, `SELECT u.id,u.username,u.display_name,u.role,u.enabled,u.created_at,u.updated_at,s.expires_at FROM app.user_sessions s JOIN app.users u ON u.id=s.user_id WHERE token_hash=$1 AND cookie_session AND expires_at>now() AND last_seen_at>now()-interval '30 minutes' AND enabled`, hash).Scan(&user.ID, &user.Username, &user.DisplayName, &user.Role, &user.Enabled, &user.CreatedAt, &user.UpdatedAt, &expiry)
	if errors.Is(err, pgx.ErrNoRows) {
		return user, expiry, auth.ErrUnauthenticated
	}
	if err != nil {
		return user, expiry, err
	}
	if touch {
		_, err = p.pool.Exec(ctx, "UPDATE app.user_sessions SET last_seen_at=now() WHERE token_hash=$1 AND last_seen_at<now()-interval '30 seconds'", hash)
	}
	return user, expiry, err
}

// SavePreauth 保存短期登录前会话摘要，允许对登录和 setup 校验 CSRF。
// 清理过期记录并限制数量，防止匿名请求无限占用存储。
func (p *Postgres) SavePreauth(ctx context.Context, hash []byte) error {
	if _, err := p.pool.Exec(ctx, "DELETE FROM app.preauth_sessions WHERE expires_at<now()"); err != nil {
		return err
	}
	tag, err := p.pool.Exec(ctx, "INSERT INTO app.preauth_sessions(token_hash,expires_at) SELECT $1,now()+interval '10 minutes' WHERE (SELECT count(*) FROM app.preauth_sessions)<10000 ON CONFLICT DO NOTHING", hash)
	if err == nil && tag.RowsAffected() == 0 {
		return errors.New("preauth capacity exceeded")
	}
	return err
}

// ValidPreauth 仅验证摘要和有效期，不返回主机信息。
// 成功认证后应消费记录。
func (p *Postgres) ValidPreauth(ctx context.Context, hash []byte) bool {
	var exists bool
	err := p.pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM app.preauth_sessions WHERE token_hash=$1 AND expires_at>now())", hash).Scan(&exists)
	return err == nil && exists
}

// DeletePreauth 消费登录前会话。
// 删除不存在记录保持幂等。
func (p *Postgres) DeletePreauth(ctx context.Context, hash []byte) error {
	_, err := p.pool.Exec(ctx, "DELETE FROM app.preauth_sessions WHERE token_hash=$1", hash)
	return err
}

// SaveSetupToken 在尚未初始化时保存十分钟有效凭据摘要。
// 必须由经过本机身份检查的 CLI 调用。
func (p *Postgres) SaveSetupToken(ctx context.Context, hash []byte) error {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(2026092901)"); err != nil {
		return err
	}
	var count int
	if err = tx.QueryRow(ctx, "SELECT count(*) FROM app.users").Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return errors.New("panel already initialized")
	}
	if _, err = tx.Exec(ctx, "DELETE FROM app.setup_tokens"); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "INSERT INTO app.setup_tokens(token_hash,expires_at) VALUES($1,now()+interval '10 minutes')", hash); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// SetupAdmin 原子消费本机凭据并创建唯一初始管理员。
// 并发请求不能抢注或覆盖已有账号。
func (p *Postgres) SetupAdmin(ctx context.Context, hash []byte, username, passwordHash string) error {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(2026092901)"); err != nil {
		return err
	}
	var count int
	if err = tx.QueryRow(ctx, "SELECT count(*) FROM app.users").Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return auth.ErrInvalidCredentials
	}
	tag, err := tx.Exec(ctx, "DELETE FROM app.setup_tokens WHERE token_hash=$1 AND expires_at>now()", hash)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return auth.ErrInvalidCredentials
	}
	if _, err = tx.Exec(ctx, "INSERT INTO app.users(username,display_name,password_hash,role) VALUES($1,'管理员',$2,'admin')", username, passwordHash); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ChangePassword 更新密码摘要并撤销用户全部会话。
// 调用方必须先重新验证当前密码。
func (p *Postgres) ChangePassword(ctx context.Context, id int64, passwordHash string) error {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "UPDATE app.users SET password_hash=$2,updated_at=now() WHERE id=$1", id, passwordHash); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "DELETE FROM app.user_sessions WHERE user_id=$1", id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
