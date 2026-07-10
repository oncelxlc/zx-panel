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

const DefaultMaxBodyBytes int64 = 1 << 20

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
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, DefaultMaxBodyBytes)
	}

	return nil
}

func shouldScanBody(method string) bool {
	switch method {
	case http.MethodPost, http.MethodPut, http.MethodPatch:
		return true
	default:
		return false
	}
}

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
