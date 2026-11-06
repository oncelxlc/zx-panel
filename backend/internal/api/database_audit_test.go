package api

import (
	"context"
	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
	"os"
	"testing"
	"zx-panel/internal/config"
)

// TestReadOnlyMigrationAudit 仅在显式诊断时核查开发库迁移影响，不执行任何写入。
// 输出只有表与记录数量，绝不输出账号、密码摘要、会话摘要或连接串。
func TestReadOnlyMigrationAudit(t *testing.T) {
	if os.Getenv("ZX_PANEL_AUDIT") != "1" {
		t.Skip("explicit read-only diagnostic")
	}
	if err := godotenv.Load("../../.env"); err != nil && !os.IsNotExist(err) {
		t.Fatal("config unavailable")
	}
	cfg, err := config.LoadServerConfig()
	if err != nil {
		t.Fatal("config invalid")
	}
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		t.Fatal("database unavailable")
	}
	defer conn.Close(ctx)
	tx, err := conn.BeginTx(ctx, pgx.TxOptions{AccessMode: pgx.ReadOnly})
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var users, cookies, legacy, preauth, tasks, apps, installs, migrations int
	err = tx.QueryRow(ctx, "SELECT (SELECT count(*) FROM app.users),(SELECT count(*) FROM app.user_sessions WHERE cookie_session),(SELECT count(*) FROM app.user_sessions WHERE NOT cookie_session),(SELECT count(*) FROM app.preauth_sessions),(SELECT count(*) FROM app.tasks),(SELECT count(*) FROM app.managed_apps),(SELECT count(*) FROM app.runtime_installations),(SELECT count(*) FROM app.schema_migrations)").Scan(&users, &cookies, &legacy, &preauth, &tasks, &apps, &installs, &migrations)
	if err != nil {
		t.Fatal("audit query unavailable")
	}
	t.Logf("read-only audit: users=%d cookieSessions=%d legacySessions=%d preauth=%d tasks=%d apps=%d installations=%d migrations=%d", users, cookies, legacy, preauth, tasks, apps, installs, migrations)
}
