package server

import (
	"fmt"
	"net/http"
	"time"

	"zx-panel/internal/api"
	"zx-panel/internal/config"
	"zx-panel/internal/storage"
)

// Run 完成后端启动前置检查并启动 HTTP 服务。
func Run(cfg config.ServerConfig) error {
	// 服务启动前确保运行时 SQLite 文件存在，避免后续接口首次访问时才暴露环境问题。
	if _, err := storage.EnsureSystemSQLite(); err != nil {
		return fmt.Errorf("system sqlite check failed: %w", err)
	}

	srv := &http.Server{
		Addr:              fmt.Sprintf(":%s", cfg.Port),
		Handler:           api.NewRouter(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	return srv.ListenAndServe()
}
