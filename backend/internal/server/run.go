package server

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	"zx-panel/internal/api"
	"zx-panel/internal/config"
	"zx-panel/internal/control"
	"zx-panel/internal/storage"
	"zx-panel/internal/web"
)

// Run 只在配置、schema、双实例锁和真实前端校验通过后监听回环端口。
// 不自动迁移或创建默认管理员，排空时先停止受理再等待 worker。
func Run(cfg config.ServerConfig) error {
	panel := cfg.Panel
	if err := panel.Validate(); err != nil {
		return err
	}
	var level slog.Level
	if err := level.UnmarshalText([]byte(panel.LogLevel)); err != nil {
		return fmt.Errorf("invalid log level: %w", err)
	}
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: level})))
	if err := verifyServerIdentity(panel); err != nil {
		return err
	}
	for _, path := range []string{panel.Paths.DataRoot, panel.Paths.StagingRoot, panel.Paths.ArtifactCacheRoot, panel.Paths.ExportRoot} {
		if err := os.MkdirAll(path, 0700); err != nil {
			return err
		}
	}
	if !panel.Helper.Enabled {
		if err := os.MkdirAll(panel.Paths.RuntimeRoot, 0755); err != nil {
			return err
		}
	}
	unlock, err := localLock(panel.Paths.DataRoot)
	if err != nil {
		return err
	}
	defer unlock()
	startup, cancelStartup := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancelStartup()
	database, err := storage.OpenPostgres(startup, panel.DatabaseURL)
	if err != nil {
		return fmt.Errorf("database unavailable; check explicit PostgreSQL configuration")
	}
	defer database.Close()
	if err = database.CheckSchema(startup); err != nil {
		return err
	}
	lock, err := database.AcquireInstanceLock(startup)
	if err != nil {
		return err
	}
	defer storage.ReleaseInstanceLock(lock)
	var hasEncrypted bool
	if err = database.Pool().QueryRow(startup, "SELECT EXISTS(SELECT 1 FROM app.app_secrets UNION ALL SELECT 1 FROM app.task_inputs UNION ALL SELECT 1 FROM app.operation_plans WHERE encrypted_input IS NOT NULL)").Scan(&hasEncrypted); err != nil {
		return err
	}
	vault, err := control.OpenVault(panel.Paths.SecretKeyFile, panel.Mode == "development" && !hasEncrypted)
	if err != nil {
		return err
	}
	assets, err := web.Assets()
	if err != nil {
		return err
	}
	service, err := control.NewService(panel, database.Pool(), vault, Version)
	if err != nil {
		return err
	}
	signalCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	ctx, cancel := context.WithCancel(signalCtx)
	defer cancel()
	if err = service.DiscoverExternal(startup); err != nil {
		return err
	}
	if err = service.Start(ctx); err != nil {
		return err
	}
	defer service.Close()
	router, err := api.NewPanelRouter(panel, database, service, assets)
	if err != nil {
		return err
	}
	server := &http.Server{Addr: panel.HTTP.Listen, Handler: router, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 << 10}
	errorsChannel := make(chan error, 1)
	go func() {
		slog.Info("zx-panel listening", "address", panel.HTTP.Listen, "version", Version)
		errorsChannel <- server.ListenAndServe()
	}()
	lockDone := make(chan struct{})
	go func() {
		defer close(lockDone)
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				probe, end := context.WithTimeout(ctx, time.Second)
				err := lock.Conn().Ping(probe)
				end()
				if err != nil {
					slog.Error("instance database lock connection lost; stopping service")
					cancel()
					return
				}
			}
		}
	}()
	select {
	case <-ctx.Done():
	case err = <-errorsChannel:
		cancel()
	}
	cancel()
	<-lockDone
	service.BeginDrain()
	drain, finish := context.WithTimeout(context.Background(), 35*time.Second)
	defer finish()
	if shutdownErr := server.Shutdown(drain); shutdownErr != nil {
		_ = server.Close()
	}
	if err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
