package main

import (
	"fmt"
	"os"
	"zx-panel/internal/server"
)

// main 复用统一 CLI 入口，保持根目录和 cmd/server 行为一致。
// 初始化、迁移与服务启动失败都以非零状态退出。
func main() {
	if err := server.Main(os.Args[1:], os.Stdout, os.Stderr); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
