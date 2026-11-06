//go:build devassets && linux

package server

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"zx-panel/internal/config"
)

// TestDevelopmentHelperRebuild 验证开发构建产生可执行文件并随源码更新。
// 使用临时 Go 模块，不启动真实 helper；覆盖 IDE PATH 缺失、错误目标平台与编译失败。
func TestDevelopmentHelperRebuild(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("GOWORK", "off")
	t.Setenv("GOFLAGS", "")
	t.Setenv("CGO_ENABLED", "0")
	t.Setenv("PATH", t.TempDir())
	t.Setenv("GOOS", "windows")
	t.Setenv("GOARCH", "arm64")
	if err := os.WriteFile("go.mod", []byte("module helper-test\n\ngo 1.25.0\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll("cmd/helper", 0700); err != nil {
		t.Fatal(err)
	}
	output := filepath.Join("build", "wsl", "zx-panel-helper")
	for _, version := range []string{"first", "updated"} {
		source := fmt.Sprintf("package main\nimport \"fmt\"\nfunc main() { fmt.Print(%q) }\n", version)
		if err := os.WriteFile("cmd/helper/main.go", []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
		if err := buildDevelopmentHelper(t.Context()); err != nil {
			t.Fatal(err)
		}
		result, err := exec.CommandContext(t.Context(), output).Output()
		if err != nil || string(result) != version {
			t.Fatalf("helper output = %q, error = %v", result, err)
		}
	}
	if err := os.WriteFile("cmd/helper/main.go", []byte("invalid Go source"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := buildDevelopmentHelper(t.Context()); err == nil {
		t.Fatal("invalid helper source accepted")
	}
	result, err := exec.CommandContext(t.Context(), output).Output()
	if err != nil || string(result) != "updated" {
		t.Fatalf("failed build changed previous helper: %q, %v", result, err)
	}
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	if err := buildDevelopmentHelper(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled build = %v", err)
	}
}

// TestDevelopmentStartupStopsWhenHelperBuildFails 验证共享服务入口必须先完成 helper 构建。
// 缺少源码时不得创建数据目录、连接数据库或启动 HTTP 服务。
func TestDevelopmentStartupStopsWhenHelperBuildFails(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("development server requires a non-root user")
	}
	t.Chdir(t.TempDir())
	t.Setenv("GOWORK", "off")
	panel := config.DefaultPanelConfig()
	panel.DatabaseURL = "postgres://unused@127.0.0.1:1/unused?sslmode=disable"
	if err := Run(config.ServerConfig{Panel: panel}); err == nil || !strings.Contains(err.Error(), "build development helper failed") {
		t.Fatalf("startup error = %v", err)
	}
	if _, err := os.Stat(panel.Paths.DataRoot); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("data directory created before helper build succeeded: %v", err)
	}
}
