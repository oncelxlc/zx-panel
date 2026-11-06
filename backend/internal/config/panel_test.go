package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// TestHelperDoesNotLoadDatabase 验证 helper 在没有数据库配置时独立加载配置。
// 即使环境中有数据库秘密也不会带入 helper 配置。
func TestHelperDoesNotLoadDatabase(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://secret:do-not-load@db.invalid/secret")
	t.Setenv("PORT", "12345")
	cfg := DefaultPanelConfig()
	cfg.Mode = "production"
	cfg.HTTP.PublicOrigin = "https://panel.example.com"
	cfg.HTTP.AllowedHosts = []string{"panel.example.com"}
	cfg.HTTP.CookieSecure = true
	body, err := json.Marshal(cfg)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "config.json")
	if err = os.WriteFile(path, body, 0600); err != nil {
		t.Fatal(err)
	}
	loaded, err := LoadHelperFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.DatabaseURL != "" || loaded.HTTP.Listen != cfg.HTTP.Listen {
		t.Fatal("helper inherited database or PORT")
	}
}

// TestLogLevelValidation 保证 check-config 和 serve 接受同一日志级别集合。
// 无效级别在启动前失败，不静默使用默认值。
func TestLogLevelValidation(t *testing.T) {
	cfg := DefaultPanelConfig()
	cfg.DatabaseURL = "postgres://panel@localhost/test"
	for _, value := range []string{"debug", "info", "warn", "error"} {
		cfg.LogLevel = value
		if err := cfg.Validate(); err != nil {
			t.Fatal(err)
		}
	}
	cfg.LogLevel = "verbose-secret"
	if err := cfg.Validate(); err == nil {
		t.Fatal("unsupported log level accepted")
	}
}

// TestProductionIgnoresWorkingDirectoryEnv 保证显式生产配置不读取无关的 .env。
// 开发模式仍把 dotenv 读取错误视为配置失败，不吞掉原有校验。
func TestProductionIgnoresWorkingDirectoryEnv(t *testing.T) {
	directory := t.TempDir()
	t.Chdir(directory)
	if err := os.Mkdir(".env", 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("DATABASE_URL", "postgres://panel@localhost/isolated")
	cfg := DefaultPanelConfig()
	cfg.Mode = "production"
	cfg.HTTP.PublicOrigin = "https://panel.example.com"
	cfg.HTTP.AllowedHosts = []string{"panel.example.com"}
	cfg.HTTP.CookieSecure = true
	body, err := json.Marshal(cfg)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(directory, "production.json")
	if err = os.WriteFile(path, body, 0600); err != nil {
		t.Fatal(err)
	}
	loaded, err := LoadFile(path)
	if err != nil || loaded.DatabaseURL != "postgres://panel@localhost/isolated" {
		t.Fatal("production depended on cwd dotenv", err)
	}
	if _, err = LoadFile(""); err == nil {
		t.Fatal("development dotenv error ignored")
	}
}
