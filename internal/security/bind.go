package security

import (
	"errors"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
)

// BindJSON 绑定 JSON 请求体，随后清洗字符串字段并执行结构体验证。
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

// BindQuery 绑定 query 参数，随后清洗字符串字段并执行结构体验证。
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

// ValidateStruct 复用 Gin 当前的 validator，实现 binding 标签一致校验。
func ValidateStruct(value any) error {
	if binding.Validator == nil {
		return nil
	}

	return binding.Validator.ValidateStruct(value)
}

// abortInvalidInput 将绑定、清洗和校验失败统一转换为 API 错误响应。
func abortInvalidInput(c *gin.Context, err error) {
	message := defaultInvalidInputReason
	if err != nil && !errors.Is(err, ErrInvalidInput) {
		message = "request validation failed"
	}

	abortSecurityError(c, 400, ErrorCodeInvalidInput, message)
}
