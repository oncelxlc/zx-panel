package config

import "os"

const defaultPort = "25000"

type ServerConfig struct {
	Port string
}

func LoadServerConfig() ServerConfig {
	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}

	return ServerConfig{
		Port: port,
	}
}
