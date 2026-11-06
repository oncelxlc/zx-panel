package api

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

// TestNewRouterHealthAndPing 验证健康检查和 ping 公共路由可访问。
// 用例确保基础安全中间件不会破坏正常请求链路。
func TestNewRouterHealthAndPing(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := NewRouter()

	tests := []struct {
		name string
		path string
	}{
		{name: "health", path: "/healthz"},
		{name: "ping", path: "/api/v1/ping"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tt.path, nil)
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want %d: %s", rec.Code, http.StatusOK, rec.Body.String())
			}
		})
	}
}

// TestNewRouterRejectsUnsafeQuery 验证全局安全中间件会拦截危险 query。
// 响应同时必须保持统一 INVALID_INPUT 错误码。
func TestNewRouterRejectsUnsafeQuery(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := NewRouter()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/ping?q=%27+OR+%271%27%3D%271", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d: %s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte(`"code":"INVALID_INPUT"`)) {
		t.Fatalf("expected INVALID_INPUT response, got %s", rec.Body.String())
	}
}

// TestNewRouterRestoresScannedJSONBody 验证 JSON body 扫描后仍可读取。
// 用例防止安全中间件消费请求体后导致下游 handler 获得空内容。
func TestNewRouterRestoresScannedJSONBody(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := NewRouter()
	router.POST("/api/v1/echo", func(c *gin.Context) {
		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			c.JSON(http.StatusInternalServerError, response{
				Success: false,
				Data:    nil,
				Error:   err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, response{
			Success: true,
			Data: map[string]string{
				"body": string(body),
			},
			Error: nil,
		})
	})

	body := []byte(`{"message":"hello"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/echo", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d: %s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var got struct {
		Data map[string]string `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if got.Data["body"] != string(body) {
		t.Fatalf("restored body = %q, want %q", got.Data["body"], string(body))
	}
}
