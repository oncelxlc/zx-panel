package security

import "errors"

const (
	// ErrorCodeInvalidInput 表示请求包含校验失败或危险输入。
	ErrorCodeInvalidInput = "INVALID_INPUT"
	// ErrorCodeRequestTooLarge 表示请求体超过安全中间件允许的大小。
	ErrorCodeRequestTooLarge = "REQUEST_TOO_LARGE"

	defaultInvalidInputReason = "request contains unsafe input"
)

var (
	// ErrInvalidInput 是安全层发现非法输入时使用的哨兵错误。
	ErrInvalidInput = errors.New("invalid input")
	// ErrRequestTooLarge 是安全层发现请求体超限时使用的哨兵错误。
	ErrRequestTooLarge = errors.New("request body too large")
)
