package api

import (
	"context"
	"encoding/json"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"testing"
	"zx-panel/internal/control"
	"zx-panel/internal/storage"
)

// TestPostgresBackupRestore 将数据库备份恢复到第二个随机隔离库并验证账号。
// 缺少官方客户端时明确跳过，绝不覆盖现有开发或业务数据库。
func TestPostgresBackupRestore(t *testing.T) {
	if os.Getenv("ZX_PANEL_INTEGRATION") != "1" {
		t.Skip("isolated PostgreSQL integration disabled")
	}
	dump, err := exec.LookPath("pg_dump")
	if err != nil {
		t.Skip("pg_dump unavailable")
	}
	restore, err := exec.LookPath("pg_restore")
	if err != nil {
		t.Skip("pg_restore unavailable")
	}
	ctx := context.Background()
	source, cfg := integrationDatabase(t)
	if _, err = source.CreateUser(ctx, "backup.admin", "Backup Admin", "admin", "backup-hash-fixture"); err != nil {
		t.Fatal(err)
	}
	vault, err := control.OpenVault(cfg.Paths.SecretKeyFile, true)
	if err != nil {
		t.Fatal(err)
	}
	app := control.App{ID: "11111111111111111111111111111111", Name: "backup-demo", Revision: "1", WorkingDirectory: cfg.Paths.AppRoots[0], RunAsUser: "zx-app", RestartPolicy: "no", Status: "stopped", Execution: control.Execution{Kind: "binary", ExecutablePath: "/srv/zx-apps/demo", Args: []string{}}}
	payload, err := json.Marshal(app)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = source.Pool().Exec(ctx, "INSERT INTO app.managed_apps(id,name,payload) VALUES($1,$2,$3)", app.ID, app.Name, payload); err != nil {
		t.Fatal(err)
	}
	scope := "environment:" + app.ID + ":BACKUP_SECRET"
	sealed, err := vault.Seal(scope, []byte("  restored secret preserves whitespace  "))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = source.Pool().Exec(ctx, "INSERT INTO app.app_secrets(app_id,name,secret,ciphertext) VALUES($1,'BACKUP_SECRET',true,$2)", app.ID, sealed); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "database.dump")
	command := exec.CommandContext(ctx, dump, "--format=custom", "--no-owner", "--no-privileges", "--file="+path)
	connection := source.Pool().Config().ConnConfig
	command.Env = append(os.Environ(), "PGDATABASE="+connection.Database, "PGHOST="+connection.Host, "PGUSER="+connection.User, "PGPASSWORD="+connection.Password, "PGPORT="+strconv.Itoa(int(connection.Port)))
	command.Stderr = io.Discard
	if err = command.Run(); err != nil {
		t.Fatal("isolated pg_dump failed")
	}
	target, _ := integrationDatabase(t, func(database *storage.Postgres) {
		config := database.Pool().Config().ConnConfig
		request := exec.CommandContext(ctx, restore, "--exit-on-error", "--no-owner", "--no-privileges", "--dbname="+config.Database, path)
		request.Env = append(os.Environ(), "PGHOST="+config.Host, "PGUSER="+config.User, "PGPASSWORD="+config.Password, "PGPORT="+strconv.Itoa(int(config.Port)))
		request.Stderr = io.Discard
		if err = request.Run(); err != nil {
			t.Fatal("isolated pg_restore failed")
		}
	})
	restored, err := target.FindUserByUsername(ctx, "backup.admin")
	if err != nil || restored.PasswordHash != "backup-hash-fixture" {
		t.Fatal("restored identity did not match", err)
	}
	if err = target.CheckSchema(ctx); err != nil {
		t.Fatal(err)
	}
	var encrypted []byte
	if err = target.Pool().QueryRow(ctx, "SELECT ciphertext FROM app.app_secrets WHERE app_id=$1 AND name='BACKUP_SECRET'", app.ID).Scan(&encrypted); err != nil {
		t.Fatal(err)
	}
	key, err := os.ReadFile(cfg.Paths.SecretKeyFile)
	if err != nil {
		t.Fatal(err)
	}
	recoveredKey := filepath.Join(t.TempDir(), "independently-restored.key")
	if err = os.WriteFile(recoveredKey, key, 0600); err != nil {
		t.Fatal(err)
	}
	recoveredVault, err := control.OpenVault(recoveredKey, false)
	if err != nil {
		t.Fatal(err)
	}
	plain, err := recoveredVault.Open(scope, encrypted)
	if err != nil || string(plain) != "  restored secret preserves whitespace  " {
		t.Fatal("restored business secret could not be decrypted with independently backed up key")
	}
	wrongVault, err := control.OpenVault(filepath.Join(t.TempDir(), "different.key"), true)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = wrongVault.Open(scope, encrypted); err == nil {
		t.Fatal("restored secret unexpectedly readable without original key")
	}
}
