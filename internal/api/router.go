package api

import (
	"zx-panel/internal/security"

	"github.com/gin-gonic/gin"
)

type response struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data"`
	Error   interface{} `json:"error"`
}

// NewRouter 创建 Gin 路由，并统一注册日志、恢复和基础安全中间件。
func NewRouter() *gin.Engine {
	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery(), security.Middleware())

	// 健康检查保持最小依赖，便于部署系统快速确认进程可用。
	router.GET("/healthz", func(c *gin.Context) {
		c.JSON(200, response{
			Success: true,
			Data: gin.H{
				"status": "ok",
			},
			Error: nil,
		})
	})

	v1 := router.Group("/api/v1")
	// ping 用于前后端或外部探针验证 API v1 路由链路。
	v1.GET("/ping", func(c *gin.Context) {
		c.JSON(200, response{
			Success: true,
			Data: gin.H{
				"message": "pong",
			},
			Error: nil,
		})
	})

	return router
}
