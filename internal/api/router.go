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

func NewRouter() *gin.Engine {
	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery(), security.Middleware())

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
