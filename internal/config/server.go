package config

import "os"

const defaultPort = "25000"

// ServerConfig 保存 HTTP 服务启动所需的运行时配置。
type ServerConfig struct {
	Port string
}

// LoadServerConfig 从环境变量加载服务配置，未设置 PORT 时使用默认端口。
func LoadServerConfig() ServerConfig {
	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}

	return ServerConfig{
		Port: port,
	}
}
