package security

import (
	"errors"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
)

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

func ValidateStruct(value any) error {
	if binding.Validator == nil {
		return nil
	}

	return binding.Validator.ValidateStruct(value)
}

func abortInvalidInput(c *gin.Context, err error) {
	message := defaultInvalidInputReason
	if err != nil && !errors.Is(err, ErrInvalidInput) {
		message = "request validation failed"
	}

	abortSecurityError(c, 400, ErrorCodeInvalidInput, message)
}
