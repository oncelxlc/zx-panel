package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// configEnvKeys 列出配置测试可能读取或修改的全部环境变量。
// 每个测试会先清空这些键，并在结束后恢复原始进程状态。
var configEnvKeys = []string{
	"PORT",
	"DATABASE_URL",
	"POSTGRES_USER",
	"POSTGRES_PASSWORD",
	"POSTGRES_HOST",
	"POSTGRES_PORT",
	"POSTGRES_DB",
	"POSTGRES_SSLMODE",
	"ADMIN_USERNAME",
	"ADMIN_PASSWORD",
}

// TestLoadServerConfigReadsDotEnv 验证服务配置会从当前目录 `.env` 读取所需值。
// 测试同时确认分字段数据库配置能够正确生成连接串。
func TestLoadServerConfigReadsDotEnv(t *testing.T) {
	resetConfigEnvironment(t)
	workingDir := enterTempWorkingDirectory(t)
	envContent := strings.Join([]string{
		"PORT=26000",
		"POSTGRES_USER=dotenv_user",
		"POSTGRES_PASSWORD=dotenv_password",
		"POSTGRES_HOST=database.local",
		"POSTGRES_PORT=5544",
		"POSTGRES_DB=dotenv_db",
		"POSTGRES_SSLMODE=require",
		"ADMIN_USERNAME=dotenv_admin",
		"ADMIN_PASSWORD=dotenv_admin_password",
	}, "\n")
	if err := os.WriteFile(filepath.Join(workingDir, ".env"), []byte(envContent), 0o600); err != nil {
		t.Fatalf("write .env: %v", err)
	}

	cfg, err := LoadServerConfig()
	if err != nil {
		t.Fatalf("load server config: %v", err)
	}
	if cfg.Port != "26000" || cfg.AdminUsername != "dotenv_admin" || cfg.AdminPassword != "dotenv_admin_password" {
		t.Fatalf("unexpected dotenv config: %+v", cfg)
	}
	if !strings.Contains(cfg.DatabaseURL, "dotenv_user:dotenv_password@database.local:5544/dotenv_db") || !strings.Contains(cfg.DatabaseURL, "sslmode=require") {
		t.Fatalf("unexpected database URL: %s", cfg.DatabaseURL)
	}
}

// TestLoadServerConfigKeepsSystemEnvironment 验证系统环境变量不会被 `.env` 覆盖。
// 该优先级保证容器、CI 和生产部署能够覆盖本地文件配置。
func TestLoadServerConfigKeepsSystemEnvironment(t *testing.T) {
	resetConfigEnvironment(t)
	workingDir := enterTempWorkingDirectory(t)
	if err := os.WriteFile(filepath.Join(workingDir, ".env"), []byte("PORT=26000\nADMIN_USERNAME=dotenv_admin\n"), 0o600); err != nil {
		t.Fatalf("write .env: %v", err)
	}
	t.Setenv("PORT", "27000")
	t.Setenv("ADMIN_USERNAME", "system_admin")

	cfg, err := LoadServerConfig()
	if err != nil {
		t.Fatalf("load server config: %v", err)
	}
	if cfg.Port != "27000" || cfg.AdminUsername != "system_admin" {
		t.Fatalf("system environment did not win: %+v", cfg)
	}
}

// TestLoadServerConfigAllowsMissingDotEnv 验证缺少 `.env` 时仍可使用默认值启动。
// 该行为保留纯系统环境和生产部署场景的兼容性。
func TestLoadServerConfigAllowsMissingDotEnv(t *testing.T) {
	resetConfigEnvironment(t)
	enterTempWorkingDirectory(t)

	cfg, err := LoadServerConfig()
	if err != nil {
		t.Fatalf("load server config without .env: %v", err)
	}
	if cfg.Port != defaultPort || cfg.AdminUsername != "admin" {
		t.Fatalf("unexpected fallback config: %+v", cfg)
	}
}

// TestLoadServerConfigRejectsInvalidDotEnv 验证格式错误的 `.env` 会阻止配置加载。
// 错误消息需要保留文件名，便于启动阶段快速定位问题。
func TestLoadServerConfigRejectsInvalidDotEnv(t *testing.T) {
	resetConfigEnvironment(t)
	workingDir := enterTempWorkingDirectory(t)
	if err := os.WriteFile(filepath.Join(workingDir, ".env"), []byte("BROKEN=\"unterminated"), 0o600); err != nil {
		t.Fatalf("write invalid .env: %v", err)
	}

	_, err := LoadServerConfig()
	if err == nil || !strings.Contains(err.Error(), ".env") {
		t.Fatalf("expected dotenv parse error, got %v", err)
	}
}

// TestLoadDotEnvRejectsUnreadablePath 验证非普通文件路径不会被当作缺失配置忽略。
// 使用目录代替权限位测试，确保 Windows 与 Linux 都能稳定触发读取错误。
func TestLoadDotEnvRejectsUnreadablePath(t *testing.T) {
	path := filepath.Join(t.TempDir(), ".env")
	if err := os.Mkdir(path, 0o700); err != nil {
		t.Fatalf("create dotenv directory: %v", err)
	}
	if err := loadDotEnv(path); err == nil {
		t.Fatal("expected unreadable dotenv path error")
	}
}

// resetConfigEnvironment 清空配置相关环境变量并在测试结束后恢复。
// 测试不并行执行，避免工作目录和进程环境的全局状态相互干扰。
func resetConfigEnvironment(t *testing.T) {
	t.Helper()
	for _, key := range configEnvKeys {
		value, exists := os.LookupEnv(key)
		if err := os.Unsetenv(key); err != nil {
			t.Fatalf("unset %s: %v", key, err)
		}
		key, value, exists := key, value, exists
		t.Cleanup(func() {
			if exists {
				_ = os.Setenv(key, value)
				return
			}
			_ = os.Unsetenv(key)
		})
	}
}

// enterTempWorkingDirectory 将当前进程切换到独立临时目录。
// 清理函数会恢复原目录，避免影响同一测试进程中的其他包内用例。
func enterTempWorkingDirectory(t *testing.T) string {
	t.Helper()
	originalDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("get working directory: %v", err)
	}
	workingDir := t.TempDir()
	if err := os.Chdir(workingDir); err != nil {
		t.Fatalf("enter temp working directory: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(originalDir)
	})
	return workingDir
}
