package main

import (
	"log"

	"zx-panel/internal/config"
	"zx-panel/internal/server"
)

func main() {
	cfg := config.LoadServerConfig()
	if err := server.Run(cfg); err != nil {
		log.Fatalf("server exited with error: %v", err)
	}
}
