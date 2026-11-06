package security

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
)

// DefaultMaxBodyBytes 是安全中间件允许扫描的默认请求体大小。
// 超出一 MiB 的请求会在进入业务 handler 前被拒绝。
const DefaultMaxBodyBytes int64 = 1 << 20

// Middleware 返回处理请求体限流和危险输入拦截的安全中间件。
// 中间件使用统一响应结构返回可识别的安全错误码。
func Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if err := scanRequest(c); err != nil {
			if errors.Is(err, ErrRequestTooLarge) {
				abortSecurityError(c, http.StatusRequestEntityTooLarge, ErrorCodeRequestTooLarge, "request body is too large")
				return
			}

			abortSecurityError(c, http.StatusBadRequest, ErrorCodeInvalidInput, defaultInvalidInputReason)
			return
		}

		c.Next()
	}
}

// scanRequest 按请求方法和内容类型扫描 query、form 与 JSON body。
// 扫描后的请求体会恢复，保证下游仍可正常绑定或读取。
func scanRequest(c *gin.Context) error {
	if err := validateInputValue(c.Request.URL.Query()); err != nil {
		return invalidInputError("query")
	}

	if !shouldScanBody(c.Request.Method) || c.Request.Body == nil || c.Request.Body == http.NoBody {
		return nil
	}

	contentType := c.GetHeader("Content-Type")
	mediaType, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		mediaType = strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	}

	switch mediaType {
	case "application/json":
		// JSON body 扫描后必须恢复，保证下游 handler 仍可正常绑定或读取。
		body, err := readAndRestoreBody(c.Request, DefaultMaxBodyBytes)
		if err != nil {
			return err
		}
		if len(bytes.TrimSpace(body)) == 0 {
			return nil
		}

		var payload any
		decoder := json.NewDecoder(bytes.NewReader(body))
		decoder.UseNumber()
		if err := decoder.Decode(&payload); err != nil {
			return nil
		}
		if err := validateInputValue(payload); err != nil {
			return invalidInputError("json body")
		}
	case "application/x-www-form-urlencoded":
		// form-urlencoded 与 query 使用同类结构，统一走递归输入检测。
		body, err := readAndRestoreBody(c.Request, DefaultMaxBodyBytes)
		if err != nil {
			return err
		}
		values, err := url.ParseQuery(string(body))
		if err != nil {
			return nil
		}
		if err := validateInputValue(values); err != nil {
			return invalidInputError("form body")
		}
	case "multipart/form-data":
		// multipart 只扫描普通字段，文件内容不在基础输入防护层内解析。
		body, err := readAndRestoreBody(c.Request, DefaultMaxBodyBytes)
		if err != nil {
			return err
		}
		boundary := params["boundary"]
		if boundary == "" {
			return nil
		}
		form, err := multipart.NewReader(bytes.NewReader(body), boundary).ReadForm(DefaultMaxBodyBytes)
		if err != nil {
			return nil
		}
		defer form.RemoveAll()
		if err := validateInputValue(form.Value); err != nil {
			return invalidInputError("multipart form")
		}
	default:
		// 未识别内容类型仍套上 MaxBytesReader，至少保留请求体大小防线。
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, DefaultMaxBodyBytes)
	}

	return nil
}

// shouldScanBody 判断 HTTP 方法是否需要扫描业务请求体。
// 当前只处理可能写入资源的 POST、PUT 和 PATCH。
func shouldScanBody(method string) bool {
	switch method {
	case http.MethodPost, http.MethodPut, http.MethodPatch:
		return true
	default:
		return false
	}
}

// readAndRestoreBody 限量读取请求体并恢复请求流。
// 超限时返回哨兵错误，同时保留内容供错误链路处理。
func readAndRestoreBody(request *http.Request, maxBytes int64) ([]byte, error) {
	if request.Body == nil {
		return nil, nil
	}

	limited := io.LimitReader(request.Body, maxBytes+1)
	body, err := io.ReadAll(limited)
	if closeErr := request.Body.Close(); err == nil && closeErr != nil {
		err = closeErr
	}
	if err != nil {
		return nil, err
	}
	if int64(len(body)) > maxBytes {
		request.Body = io.NopCloser(bytes.NewReader(body))
		return nil, ErrRequestTooLarge
	}

	request.Body = io.NopCloser(bytes.NewReader(body))
	request.ContentLength = int64(len(body))
	return body, nil
}

// abortSecurityError 输出统一结构的安全错误并中止请求链。
// code 和 message 由调用方根据具体安全边界传入。
func abortSecurityError(c *gin.Context, status int, code string, message string) {
	c.AbortWithStatusJSON(status, gin.H{
		"success": false,
		"data":    nil,
		"error": gin.H{
			"code":    code,
			"message": message,
		},
	})
}
