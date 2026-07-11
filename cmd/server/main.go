package main

import (
	"log"

	"zx-panel/internal/config"
	"zx-panel/internal/server"
)

// main 是后端服务的标准命令行入口。
// 配置加载失败或服务退出时统一记录错误并终止进程。
func main() {
	// 标准入口先加载 `.env` 与系统环境，再交给服务层启动。
	cfg, err := config.LoadServerConfig()
	if err != nil {
		log.Fatalf("load server config: %v", err)
	}
	if err := server.Run(cfg); err != nil {
		log.Fatalf("server exited with error: %v", err)
	}
}
