package auth

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

const userContextKey = "authenticatedUser"

// RequireAuthentication 校验 Bearer Token，并把当前用户写入 Gin 上下文。
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
func BearerToken(authorization string) string {
	parts := strings.Fields(authorization)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return parts[1]
}

// CurrentUser 从 Gin 上下文取得认证中间件写入的用户。
func CurrentUser(c *gin.Context) (User, bool) {
	value, exists := c.Get(userContextKey)
	if !exists {
		return User{}, false
	}
	user, ok := value.(User)
	return user, ok
}
