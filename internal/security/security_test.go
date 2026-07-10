package security

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestIsUnsafeStringAllowsCommonInput(t *testing.T) {
	inputs := []string{
		"普通中文搜索 select admin",
		"user@example.com",
		"/api/v1/nginx/index",
		"select a dashboard item",
		"notes: admin can review this item",
	}

	for _, input := range inputs {
		if IsUnsafeString(input) {
			t.Fatalf("expected %q to be allowed", input)
		}
	}
}

func TestIsUnsafeStringDetectsInjectionShapes(t *testing.T) {
	inputs := []string{
		"' OR '1'='1",
		"UNION SELECT password FROM users",
		"; DROP TABLE users",
		`{"$ne": null}`,
		"$where",
		"; rm -rf /",
		"&& whoami",
		"`whoami`",
		"$(whoami)",
	}

	for _, input := range inputs {
		if !IsUnsafeString(input) {
			t.Fatalf("expected %q to be rejected", input)
		}
	}
}

func TestValidateInputValueDetectsNoSQLOperatorKeys(t *testing.T) {
	payload := map[string]any{
		"username": map[string]any{
			"$ne": nil,
		},
	}

	if err := validateInputValue(payload); err == nil {
		t.Fatal("expected NoSQL operator key to be rejected")
	}
}

func TestSanitizeString(t *testing.T) {
	got := SanitizeString(" \x00\t中文\u0008 value\n ")
	want := "中文 value"
	if got != want {
		t.Fatalf("SanitizeString() = %q, want %q", got, want)
	}
}

func TestSanitizeValue(t *testing.T) {
	got := SanitizeValue(map[string]any{
		" name ": " Alice\x00 ",
		"tags": []any{
			" dev\u0008 ",
		},
	}).(map[string]any)

	if _, ok := got["name"]; !ok {
		t.Fatalf("expected sanitized key, got %#v", got)
	}
	if got["name"] != "Alice" {
		t.Fatalf("expected sanitized value, got %#v", got["name"])
	}

	tags := got["tags"].([]any)
	if tags[0] != "dev" {
		t.Fatalf("expected sanitized nested value, got %#v", tags[0])
	}
}

func TestMiddlewareRejectsUnsafeQuery(t *testing.T) {
	router := testRouter()
	router.GET("/ping", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	req := httptest.NewRequest(http.MethodGet, "/ping?q=%27+OR+%271%27%3D%271", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}

	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	errorBody := body["error"].(map[string]any)
	if errorBody["code"] != ErrorCodeInvalidInput {
		t.Fatalf("error code = %#v, want %s", errorBody["code"], ErrorCodeInvalidInput)
	}
}

func TestMiddlewareRejectsUnsafeJSONAndRestoresSafeBody(t *testing.T) {
	router := testRouter()
	router.POST("/echo", func(c *gin.Context) {
		raw, err := c.GetRawData()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.Data(http.StatusOK, "application/json", raw)
	})

	unsafeReq := httptest.NewRequest(http.MethodPost, "/echo", strings.NewReader(`{"name":{"$ne":null}}`))
	unsafeReq.Header.Set("Content-Type", "application/json")
	unsafeRec := httptest.NewRecorder()
	router.ServeHTTP(unsafeRec, unsafeReq)
	if unsafeRec.Code != http.StatusBadRequest {
		t.Fatalf("unsafe status = %d, want %d", unsafeRec.Code, http.StatusBadRequest)
	}

	body := []byte(`{"name":"normal"}`)
	safeReq := httptest.NewRequest(http.MethodPost, "/echo", bytes.NewReader(body))
	safeReq.Header.Set("Content-Type", "application/json")
	safeRec := httptest.NewRecorder()
	router.ServeHTTP(safeRec, safeReq)
	if safeRec.Code != http.StatusOK {
		t.Fatalf("safe status = %d, want %d", safeRec.Code, http.StatusOK)
	}
	if !bytes.Equal(bytes.TrimSpace(safeRec.Body.Bytes()), body) {
		t.Fatalf("body = %q, want %q", safeRec.Body.String(), string(body))
	}
}

func TestMiddlewareRejectsLargeBody(t *testing.T) {
	router := testRouter()
	router.POST("/echo", func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodPost, "/echo", strings.NewReader(strings.Repeat("a", int(DefaultMaxBodyBytes)+1)))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusRequestEntityTooLarge)
	}
}

func TestBindJSONSanitizesAndValidates(t *testing.T) {
	type payload struct {
		Name string            `json:"name" binding:"required"`
		Tags []string          `json:"tags"`
		Meta map[string]string `json:"meta"`
	}

	router := testRouter()
	router.POST("/bind", func(c *gin.Context) {
		var input payload
		if !BindJSON(c, &input) {
			return
		}

		c.JSON(http.StatusOK, input)
	})

	req := httptest.NewRequest(http.MethodPost, "/bind", strings.NewReader(`{"name":"  Alice\u0000 ","tags":[" dev\u0008 "],"meta":{" role ":" admin "}}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d: %s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var got payload
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if got.Name != "Alice" || got.Tags[0] != "dev" || got.Meta["role"] != "admin" {
		t.Fatalf("unexpected sanitized payload: %#v", got)
	}

	blankReq := httptest.NewRequest(http.MethodPost, "/bind", strings.NewReader(`{"name":"   "}`))
	blankReq.Header.Set("Content-Type", "application/json")
	blankRec := httptest.NewRecorder()
	router.ServeHTTP(blankRec, blankReq)
	if blankRec.Code != http.StatusBadRequest {
		t.Fatalf("blank status = %d, want %d", blankRec.Code, http.StatusBadRequest)
	}
}

func testRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(Middleware())
	return router
}
