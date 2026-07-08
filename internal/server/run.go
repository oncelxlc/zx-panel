package server

import (
	"fmt"
	"net/http"
	"time"

	"zx-panel/internal/api"
	"zx-panel/internal/config"
	"zx-panel/internal/storage"
)

func Run(cfg config.ServerConfig) error {
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
