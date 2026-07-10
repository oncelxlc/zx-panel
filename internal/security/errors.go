package security

import "errors"

const (
	ErrorCodeInvalidInput     = "INVALID_INPUT"
	ErrorCodeRequestTooLarge  = "REQUEST_TOO_LARGE"
	defaultInvalidInputReason = "request contains unsafe input"
)

var (
	ErrInvalidInput    = errors.New("invalid input")
	ErrRequestTooLarge = errors.New("request body too large")
)
