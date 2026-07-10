package main

import (
	"log"

	"zx-panel/internal/config"
	"zx-panel/internal/server"
)

// main 是后端服务的标准命令行入口。
func main() {
	// 标准服务入口：加载环境配置后交给 internal/server 统一启动。
	cfg := config.LoadServerConfig()
	if err := server.Run(cfg); err != nil {
		log.Fatalf("server exited with error: %v", err)
	}
}
