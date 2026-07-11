package config

import (
	"net/url"
	"os"
	"time"
)

const defaultPort = "25000"

const defaultSessionTTL = 24 * time.Hour

// ServerConfig 保存 HTTP 服务启动所需的运行时配置。
type ServerConfig struct {
	Port          string
	DatabaseURL   string
	AdminUsername string
	AdminPassword string
	SessionTTL    time.Duration
}

// LoadServerConfig 从环境变量加载服务配置，未设置 PORT 时使用默认端口。
func LoadServerConfig() ServerConfig {
	return ServerConfig{
		Port:          envOrDefault("PORT", defaultPort),
		DatabaseURL:   loadDatabaseURL(),
		AdminUsername: envOrDefault("ADMIN_USERNAME", "admin"),
		AdminPassword: os.Getenv("ADMIN_PASSWORD"),
		SessionTTL:    defaultSessionTTL,
	}
}

// loadDatabaseURL 优先使用完整连接串，否则根据 PostgreSQL 环境变量生成本地开发连接串。
func loadDatabaseURL() string {
	if databaseURL := os.Getenv("DATABASE_URL"); databaseURL != "" {
		return databaseURL
	}

	connectionURL := &url.URL{
		Scheme: "postgres",
		User: url.UserPassword(
			envOrDefault("POSTGRES_USER", "zx_panel"),
			envOrDefault("POSTGRES_PASSWORD", "change_me_postgres"),
		),
		Host: envOrDefault("POSTGRES_HOST", "127.0.0.1") + ":" + envOrDefault("POSTGRES_PORT", "5432"),
		Path: envOrDefault("POSTGRES_DB", "zx_panel"),
	}
	query := connectionURL.Query()
	query.Set("sslmode", envOrDefault("POSTGRES_SSLMODE", "disable"))
	connectionURL.RawQuery = query.Encode()

	return connectionURL.String()
}

// envOrDefault 返回非空环境变量值，否则使用给定默认值。
func envOrDefault(key string, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
