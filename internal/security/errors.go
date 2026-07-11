package security

import "errors"

// 安全错误码定义客户端可以稳定识别的请求失败类别。
// 默认消息保持通用，避免向外部暴露具体检测实现。
const (
	// ErrorCodeInvalidInput 表示请求包含校验失败或危险输入。
	// 客户端可使用该错误码提示用户修正请求内容。
	ErrorCodeInvalidInput = "INVALID_INPUT"
	// ErrorCodeRequestTooLarge 表示请求体超过安全中间件允许的大小。
	// 客户端可使用该错误码提示用户缩减请求内容。
	ErrorCodeRequestTooLarge = "REQUEST_TOO_LARGE"

	// defaultInvalidInputReason 是危险输入响应使用的默认安全消息。
	// 消息不会暴露具体命中的检测规则和内部实现。
	defaultInvalidInputReason = "request contains unsafe input"
)

// 安全哨兵错误用于在内部错误链中保留失败类别。
// 上层通过 errors.Is 判断类型并映射到对应 HTTP 响应。
var (
	// ErrInvalidInput 是安全层发现非法输入时使用的哨兵错误。
	// 上层通过 errors.Is 保留稳定的错误分类能力。
	ErrInvalidInput = errors.New("invalid input")
	// ErrRequestTooLarge 是安全层发现请求体超限时使用的哨兵错误。
	// 中间件将该错误映射为 HTTP 413 响应。
	ErrRequestTooLarge = errors.New("request body too large")
)
