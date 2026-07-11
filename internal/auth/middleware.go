package auth

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// userContextKey 是 Gin 上下文中保存认证用户的内部键。
// 该键不对包外暴露，调用方通过 CurrentUser 安全读取。
const userContextKey = "authenticatedUser"

// RequireAuthentication 校验 Bearer Token 并写入当前用户。
// 校验失败时中止请求链并返回统一未认证错误响应。
func RequireAuthentication(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := BearerToken(c.GetHeader("Authorization"))
		user, err := service.Authenticate(c.Request.Context(), token)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"data":    nil,
				"error": gin.H{
					"code":    "UNAUTHENTICATED",
					"message": "请先登录或重新登录",
				},
			})
			return
		}

		c.Set(userContextKey, user)
		c.Next()
	}
}

// BearerToken 从 Authorization 请求头解析 Bearer Token。
// 头部格式不完整或认证方案不匹配时返回空字符串。
func BearerToken(authorization string) string {
	parts := strings.Fields(authorization)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return parts[1]
}

// CurrentUser 从 Gin 上下文取得认证中间件写入的用户。
// 返回值中的布尔量用于区分缺失值或意外类型。
func CurrentUser(c *gin.Context) (User, bool) {
	value, exists := c.Get(userContextKey)
	if !exists {
		return User{}, false
	}
	user, ok := value.(User)
	return user, ok
}
