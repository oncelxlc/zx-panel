package server

import (
	"fmt"
	"net/http"
	"time"

	"zx-panel/internal/api"
	"zx-panel/internal/config"
)

func Run(cfg config.ServerConfig) error {
	srv := &http.Server{
		Addr:              fmt.Sprintf(":%s", cfg.Port),
		Handler:           api.NewRouter(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	return srv.ListenAndServe()
}
