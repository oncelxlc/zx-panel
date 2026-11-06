package main

import (
	"context"
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"
	"zx-panel/internal/config"
	"zx-panel/internal/host"
)

// main 启动独立 Unix Socket helper，不监听任何 TCP 端口。
// 配置错误或非 root 身份都会在接收请求之前失败。
func main() {
	path := flag.String("config", "/etc/zx-panel/config.json", "deployment config")
	flag.Parse()
	cfg, err := config.LoadHelperFile(*path)
	if err != nil {
		log.Fatal(err)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err = host.Run(ctx, cfg); err != nil {
		log.Fatal(err)
	}
}
