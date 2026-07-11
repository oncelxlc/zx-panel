package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"time"

	"github.com/joho/godotenv"
)

// defaultPort 是 HTTP 服务未配置端口时使用的默认值。
// 该端口与前端开发代理和 README 保持一致。
const defaultPort = "25000"

// defaultSessionTTL 是登录会话的默认有效期。
// 所有新建会话统一基于该时长计算过期时间。
const defaultSessionTTL = 24 * time.Hour

// ServerConfig 保存 HTTP 服务启动所需的运行时配置。
// 配置值来自系统环境、可选 `.env` 和代码默认值。
type ServerConfig struct {
	Port          string
	DatabaseURL   string
	AdminUsername string
	AdminPassword string
	SessionTTL    time.Duration
}

// LoadServerConfig 先加载当前工作目录的可选 `.env`，再构造服务配置。
// 已存在的系统环境变量保持最高优先级，解析错误会阻止服务带病启动。
func LoadServerConfig() (ServerConfig, error) {
	if err := loadDotEnv(".env"); err != nil {
		return ServerConfig{}, err
	}

	return ServerConfig{
		Port:          envOrDefault("PORT", defaultPort),
		DatabaseURL:   loadDatabaseURL(),
		AdminUsername: envOrDefault("ADMIN_USERNAME", "admin"),
		AdminPassword: os.Getenv("ADMIN_PASSWORD"),
		SessionTTL:    defaultSessionTTL,
	}, nil
}

// loadDatabaseURL 优先使用完整连接串，否则根据 PostgreSQL 环境变量生成本地开发连接串。
// 分字段配置会通过 net/url 安全编码用户名、密码和查询参数。
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
// 空字符串按未配置处理，保持现有配置回退语义。
func envOrDefault(key string, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

// loadDotEnv 将指定 dotenv 文件加载到进程环境中。
// 文件缺失视为可选配置，其他读取或解析错误会带路径上下文返回。
func loadDotEnv(path string) error {
	if err := godotenv.Load(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("load dotenv file %s: %w", path, err)
	}
	return nil
}
