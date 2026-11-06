//go:build devassets && linux

package server

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"syscall"
)

// buildDevelopmentHelper 在每次开发服务启动前构建当前源码对应的 Linux helper。
// 工作目录沿用 backend；只生成二进制，不提权、启动 helper 或修改部署配置。
func buildDevelopmentHelper(ctx context.Context) error {
	ctx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()
	output, err := filepath.Abs("build/wsl/zx-panel-helper")
	if err != nil {
		return err
	}
	goTool, err := exec.LookPath("go")
	if err != nil {
		// IDE 可以直接调用 SDK，未必把 Go 加入进程 PATH。
		goTool = filepath.Join(runtime.GOROOT(), "bin", "go")
	}
	slog.Info("building development helper", "path", output)
	command := exec.CommandContext(ctx, goTool, "build", "-mod=readonly", "-o", output, "./cmd/helper")
	command.Env = append(os.Environ(), "GOOS="+runtime.GOOS, "GOARCH="+runtime.GOARCH)
	command.Stdout, command.Stderr = os.Stdout, os.Stderr
	if err := command.Run(); err != nil {
		return fmt.Errorf("build development helper failed (requires backend working directory and Linux Go): %w", err)
	}
	slog.Info("development helper ready", "path", output)
	return nil
}
