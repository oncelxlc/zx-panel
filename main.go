package main

import (
	"log"

	"zx-panel/internal/config"
	"zx-panel/internal/server"
)

// main 是根目录启动入口，复用标准服务启动链路。
func main() {
	// 根入口与 cmd/server 保持同一套启动链路，便于本地直接 go run .
	cfg := config.LoadServerConfig()
	if err := server.Run(cfg); err != nil {
		log.Fatalf("server exited with error: %v", err)
	}
}
