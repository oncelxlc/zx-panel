package storage

import (
	"context"
	"zx-panel/internal/auth"
)

// ChangePasswordIfHash 在持久化时再次检查经过验证的原摘要。
// 并发改密不能覆盖更晚的密码，也不能保留任何旧会话。
func (p *Postgres) ChangePasswordIfHash(ctx context.Context, id int64, expected, newHash string) error {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	tag, err := tx.Exec(ctx, "UPDATE app.users SET password_hash=$3,updated_at=now() WHERE id=$1 AND password_hash=$2 AND enabled", id, expected, newHash)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return auth.ErrInvalidCredentials
	}
	if _, err = tx.Exec(ctx, "DELETE FROM app.user_sessions WHERE user_id=$1", id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
