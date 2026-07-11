package server

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"zx-panel/internal/api"
	"zx-panel/internal/auth"
	"zx-panel/internal/config"
	"zx-panel/internal/storage"
)

// Run 完成后端启动前置检查并启动 HTTP 服务。
func Run(cfg config.ServerConfig) error {
	// 启动阶段完成数据库连通性、表迁移和首个管理员检查，避免带病接受 HTTP 请求。
	startupContext, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	database, err := storage.OpenPostgres(startupContext, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("postgres startup failed: %w", err)
	}
	defer database.Close()
	if err := database.Migrate(startupContext); err != nil {
		return err
	}

	authService := auth.NewService(database, cfg.SessionTTL)
	if err := authService.EnsureInitialAdmin(startupContext, cfg.AdminUsername, cfg.AdminPassword); err != nil {
		return fmt.Errorf("initial administrator check failed: %w", err)
	}

	srv := &http.Server{
		Addr:              fmt.Sprintf(":%s", cfg.Port),
		Handler:           api.NewRouterWithAuth(authService),
		ReadHeaderTimeout: 5 * time.Second,
	}

	return srv.ListenAndServe()
}
