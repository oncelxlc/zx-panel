package server

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"flag"
	"fmt"
	"github.com/jackc/pgx/v5"
	"io"
	"net/url"
	"os"
	"os/exec"
	"strings"
	"time"
	"zx-panel/internal/config"
	"zx-panel/internal/control"
	"zx-panel/internal/storage"
)

// Main 统一根入口与 cmd/server 的命令行能力。
// 显式迁移、初始化和备份不依赖 Web UI 或主机 Node/Go CLI。
func Main(args []string, stdout, stderr io.Writer) error {
	command := "serve"
	if len(args) > 0 && !strings.HasPrefix(args[0], "-") {
		command = args[0]
		args = args[1:]
	}
	migration := "status"
	if command == "migrate" && len(args) > 0 && !strings.HasPrefix(args[0], "-") {
		migration = args[0]
		args = args[1:]
	}
	flags := flag.NewFlagSet("zx-panel "+command, flag.ContinueOnError)
	flags.SetOutput(stderr)
	configPath := flags.String("config", "", "JSON deployment config path")
	backupPath := flags.String("output", "", "new backup output file")
	beforeMigration := flags.String("backup", "", "backup file required before upgrading an existing installation")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if flags.NArg() != 0 {
		return errors.New("unexpected command arguments")
	}
	if command == "version" {
		_, err := fmt.Fprintf(stdout, "zx-panel %s\ncommit=%s\nbuildTime=%s\n", Version, Commit, BuildTime)
		return err
	}
	cfg, err := config.LoadFile(*configPath)
	if err != nil {
		return err
	}
	switch command {
	case "check-config":
		_, err = fmt.Fprintf(stdout, "Configuration valid; mode=%s, listen=%s\n", cfg.Panel.Mode, cfg.Panel.HTTP.Listen)
		return err
	case "serve":
		return Run(cfg)
	case "init-key":
		if err = verifyLocalIdentity(cfg.Panel); err != nil {
			return err
		}
		if _, err = os.Lstat(cfg.Panel.Paths.SecretKeyFile); err == nil {
			return errors.New("key already exists; refusing to replace it")
		}
		_, err = control.OpenVault(cfg.Panel.Paths.SecretKeyFile, true)
		if err == nil {
			_, err = fmt.Fprintln(stdout, "Independent secret key created; back it up separately from PostgreSQL.")
		}
		return err
	case "setup-token", "migrate", "backup":
	default:
		return errors.New("commands: serve, check-config, version, init-key, setup-token, migrate status|up, backup")
	}
	if err = verifyLocalIdentity(cfg.Panel); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	database, err := storage.OpenPostgres(ctx, cfg.DatabaseURL)
	if err != nil {
		return errors.New("PostgreSQL connection unavailable")
	}
	defer database.Close()
	if command == "backup" {
		return Backup(ctx, cfg.DatabaseURL, *backupPath, stdout)
	}
	if command == "setup-token" {
		if err = database.CheckSchema(ctx); err != nil {
			return err
		}
		var raw [32]byte
		if _, err = rand.Read(raw[:]); err != nil {
			return err
		}
		token := base64.RawURLEncoding.EncodeToString(raw[:])
		hash := sha256.Sum256([]byte(token))
		if err = database.SaveSetupToken(ctx, hash[:]); err != nil {
			return err
		}
		_, err = fmt.Fprintf(stdout, "One-time initialization token (expires in 10 minutes):\n%s\n", token)
		return err
	}
	if migration == "status" {
		if err = database.CheckSchema(ctx); err != nil {
			return err
		}
		_, err = fmt.Fprintln(stdout, "Schema is current; every migration checksum verified.")
		return err
	}
	if migration != "up" {
		return errors.New("migrate accepts status or up")
	}
	lock, err := database.AcquireInstanceLock(ctx)
	if err != nil {
		return err
	}
	defer storage.ReleaseInstanceLock(lock)
	var existing bool
	if err = database.Pool().QueryRow(ctx, "SELECT to_regclass('app.users') IS NOT NULL").Scan(&existing); err != nil {
		return err
	}
	if existing {
		var count int64
		if err = database.Pool().QueryRow(ctx, "SELECT count(*) FROM app.users").Scan(&count); err != nil {
			return err
		}
		if count > 0 {
			if *beforeMigration == "" {
				return errors.New("existing users detected; stop service and supply --backup NEW_FILE before migrate up")
			}
			if err = Backup(ctx, cfg.DatabaseURL, *beforeMigration, stdout); err != nil {
				return err
			}
		}
	}
	if err = database.MigratePanel(ctx); err != nil {
		return err
	}
	_, err = fmt.Fprintln(stdout, "Schema migration complete; existing user password hashes preserved; legacy Bearer sessions revoked.")
	return err
}

// Backup 通过固定 pg_dump 参数导出独立文件，连接密码仅放入子进程环境。
// 文件必须尚不存在，失败会移除未完成备份。
func Backup(ctx context.Context, databaseURL, output string, stdout io.Writer) error {
	if output == "" {
		return errors.New("backup requires --output NEW_FILE")
	}
	cfg, err := pgx.ParseConfig(databaseURL)
	if err != nil {
		return errors.New("invalid PostgreSQL backup configuration")
	}
	file, err := os.OpenFile(output, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	success := false
	defer func() {
		_ = file.Close()
		if !success {
			_ = os.Remove(output)
		}
	}()
	command := exec.CommandContext(ctx, "pg_dump", "--format=custom", "--no-owner", "--no-privileges")
	environment := []string{}
	for _, value := range os.Environ() {
		if !strings.HasPrefix(value, "PG") {
			environment = append(environment, value)
		}
	}
	parsed, err := url.Parse(databaseURL)
	if err != nil {
		return errors.New("invalid PostgreSQL backup URL")
	}
	ssl := parsed.Query().Get("sslmode")
	if ssl == "" {
		ssl = "prefer"
	}
	command.Env = append(environment, "PGHOST="+cfg.Host, fmt.Sprintf("PGPORT=%d", cfg.Port), "PGDATABASE="+cfg.Database, "PGUSER="+cfg.User, "PGPASSWORD="+cfg.Password, "PGSSLMODE="+ssl, "PGCONNECT_TIMEOUT=10")
	for parameter, variable := range map[string]string{"sslrootcert": "PGSSLROOTCERT", "sslcert": "PGSSLCERT", "sslkey": "PGSSLKEY"} {
		if value := parsed.Query().Get(parameter); value != "" {
			command.Env = append(command.Env, variable+"="+value)
		}
	}
	command.Stdout = file
	command.Stderr = io.Discard
	if err = command.Run(); err != nil {
		return errors.New("pg_dump failed; check installed client version and database permissions")
	}
	if err = file.Sync(); err != nil {
		return err
	}
	if err = file.Close(); err != nil {
		return err
	}
	success = true
	_, err = fmt.Fprintln(stdout, "PostgreSQL backup complete. Verify restoration in a separate database; secret key is not included.")
	return err
}
