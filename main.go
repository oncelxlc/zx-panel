package main

import (
	"log"

	"zx-panel/internal/config"
	"zx-panel/internal/server"
)

// main 是根目录启动入口，复用标准服务启动链路。
// 配置加载失败或服务退出时统一记录错误并终止进程。
func main() {
	// 根入口先加载 `.env` 与系统环境，再进入统一服务启动流程。
	cfg, err := config.LoadServerConfig()
	if err != nil {
		log.Fatalf("load server config: %v", err)
	}
	if err := server.Run(cfg); err != nil {
		log.Fatalf("server exited with error: %v", err)
	}
}
