package api

import (
	"context"
	"crypto/sha256"
	"testing"
	"time"
	"zx-panel/internal/storage"
)

// TestLegacyMigrationPreservesIdentity 验证真实旧表升级，不覆盖用户与密码摘要。
// 全部创建、迁移和会话撤销仅发生在隔离数据库中。
func TestLegacyMigrationPreservesIdentity(t *testing.T) {
	ctx := context.Background()
	digest := "preserved-legacy-password-hash"
	database, _ := integrationDatabase(t, func(database *storage.Postgres) {
		if err := database.Migrate(ctx); err != nil {
			t.Fatal(err)
		}
		user, err := database.CreateUser(ctx, "legacy.admin", "Legacy Admin", "admin", digest)
		if err != nil {
			t.Fatal(err)
		}
		token := sha256.Sum256([]byte("legacy-session-fixture"))
		if err = database.CreateSession(ctx, token[:], user.ID, time.Now().Add(time.Hour)); err != nil {
			t.Fatal(err)
		}
	})
	user, err := database.FindUserByUsername(ctx, "legacy.admin")
	if err != nil || user.PasswordHash != digest || user.DisplayName != "Legacy Admin" {
		t.Fatal("legacy identity changed", err)
	}
	var count int
	if err = database.Pool().QueryRow(ctx, "SELECT count(*) FROM app.user_sessions").Scan(&count); err != nil || count != 0 {
		t.Fatal("legacy session not revoked", err)
	}
	if err = database.MigratePanel(ctx); err != nil {
		t.Fatal("migration replay failed", err)
	}
	if err = database.CheckSchema(ctx); err != nil {
		t.Fatal(err)
	}
}
