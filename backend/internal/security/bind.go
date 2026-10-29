package security

import (
	"errors"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
)

// BindJSON 绑定 JSON 请求体并清洗、验证目标结构。
// 任一步失败都会写入统一错误响应并返回 false。
func BindJSON(c *gin.Context, dst any) bool {
	if err := c.ShouldBindJSON(dst); err != nil {
		abortInvalidInput(c, err)
		return false
	}

	sanitizeInPlace(dst)
	if err := ValidateStruct(dst); err != nil {
		abortInvalidInput(c, err)
		return false
	}

	return true
}

// BindQuery 绑定 query 参数并清洗、验证目标结构。
// 任一步失败都会写入统一错误响应并返回 false。
func BindQuery(c *gin.Context, dst any) bool {
	if err := c.ShouldBindQuery(dst); err != nil {
		abortInvalidInput(c, err)
		return false
	}

	sanitizeInPlace(dst)
	if err := ValidateStruct(dst); err != nil {
		abortInvalidInput(c, err)
		return false
	}

	return true
}

// ValidateStruct 复用 Gin 当前注册的结构体验证器。
// 该入口保证手动校验与 binding 标签使用相同规则。
func ValidateStruct(value any) error {
	if binding.Validator == nil {
		return nil
	}

	return binding.Validator.ValidateStruct(value)
}

// abortInvalidInput 将绑定、清洗和校验失败转换为统一错误响应。
// 对外消息保持安全，不直接泄露内部验证器实现细节。
func abortInvalidInput(c *gin.Context, err error) {
	message := defaultInvalidInputReason
	if err != nil && !errors.Is(err, ErrInvalidInput) {
		message = "request validation failed"
	}

	abortSecurityError(c, 400, ErrorCodeInvalidInput, message)
}
