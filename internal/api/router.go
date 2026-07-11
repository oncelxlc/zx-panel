package api

import (
	"errors"
	"net/http"

	"zx-panel/internal/auth"
	"zx-panel/internal/security"

	"github.com/gin-gonic/gin"
)

// response 描述后端统一返回的 success、data、error 结构。
// handler 通过该类型保证成功与失败响应字段保持一致。
type response struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data"`
	Error   interface{} `json:"error"`
}

// NewRouter 创建不含认证依赖的 Gin 路由。
// 该入口主要用于基础路由和安全中间件的隔离测试。
func NewRouter() *gin.Engine {
	return newRouter(nil)
}

// NewRouterWithAuth 创建包含数据库登录接口与认证中间件的完整路由。
// 生产服务通过该入口注入认证服务并开放登录会话能力。
func NewRouterWithAuth(authService *auth.Service) *gin.Engine {
	return newRouter(authService)
}

// newRouter 统一组装公共中间件、健康检查和 API 路由。
// authService 为空时跳过认证接口，便于测试公共安全基线。
func newRouter(authService *auth.Service) *gin.Engine {
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

	if authService != nil {
		registerAuthRoutes(v1, authService)
	}

	return router
}

// loginRequest 描述登录接口接受的账号密码字段。
// binding 标签在进入认证服务前执行基础长度校验。
type loginRequest struct {
	Username string `json:"username" binding:"required,min=3,max=32"`
	Password string `json:"password" binding:"required,min=6,max=72"`
}

// registerAuthRoutes 注册公开登录以及受保护的当前用户和退出接口。
// 受保护路由统一经过 Bearer Token 认证中间件。
func registerAuthRoutes(v1 *gin.RouterGroup, authService *auth.Service) {
	v1.POST("/auth/login", func(c *gin.Context) {
		var request loginRequest
		if !security.BindJSON(c, &request) {
			return
		}

		result, err := authService.Login(c.Request.Context(), request.Username, request.Password)
		if err != nil {
			if errors.Is(err, auth.ErrInvalidCredentials) {
				writeError(c, http.StatusUnauthorized, "INVALID_CREDENTIALS", "账号或密码错误")
				return
			}
			writeError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "登录服务暂时不可用")
			return
		}

		c.JSON(http.StatusOK, response{Success: true, Data: result, Error: nil})
	})

	protected := v1.Group("/auth")
	protected.Use(auth.RequireAuthentication(authService))
	protected.GET("/me", func(c *gin.Context) {
		user, ok := auth.CurrentUser(c)
		if !ok {
			writeError(c, http.StatusUnauthorized, "UNAUTHENTICATED", "请先登录或重新登录")
			return
		}
		c.JSON(http.StatusOK, response{Success: true, Data: gin.H{"user": user}, Error: nil})
	})
	protected.POST("/logout", func(c *gin.Context) {
		token := auth.BearerToken(c.GetHeader("Authorization"))
		if err := authService.Logout(c.Request.Context(), token); err != nil {
			writeError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "退出登录失败")
			return
		}
		c.JSON(http.StatusOK, response{Success: true, Data: gin.H{"loggedOut": true}, Error: nil})
	})
}

// writeError 输出统一的 API 错误响应结构。
// code 供客户端判断错误类型，message 用于安全的用户提示。
func writeError(c *gin.Context, status int, code string, message string) {
	c.JSON(status, response{
		Success: false,
		Data:    nil,
		Error: gin.H{
			"code":    code,
			"message": message,
		},
	})
}
