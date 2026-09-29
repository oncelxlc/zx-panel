package api

import (
	"encoding/json"
	"fmt"
	"github.com/gin-gonic/gin"
	"os"
	"regexp"
	"strings"
	"testing"
	"zx-panel/internal/config"
	"zx-panel/internal/control"
)

// assertAPIContract 对比真实 Gin 路由和发布的 OpenAPI 方法集合。
// 任意新增、删除或路径拼写偏差都需要同步契约。
func assertAPIContract(router *gin.Engine) error {
	body, err := os.ReadFile("../../docs/openapi.json")
	if err != nil {
		return err
	}
	var document struct {
		Paths map[string]map[string]json.RawMessage `json:"paths"`
	}
	if err = json.Unmarshal(body, &document); err != nil {
		return err
	}
	expected := map[string]bool{}
	for path, methods := range document.Paths {
		for method := range methods {
			expected[strings.ToUpper(method)+" /api/v1"+path] = true
		}
	}
	parameters := regexp.MustCompile(`:([A-Za-z][A-Za-z0-9_]*)`)
	for _, route := range router.Routes() {
		if !strings.HasPrefix(route.Path, "/api/v1/") {
			continue
		}
		key := route.Method + " " + parameters.ReplaceAllString(route.Path, "{$1}")
		if !expected[key] {
			return fmt.Errorf("undeclared API route %s", key)
		}
		delete(expected, key)
	}
	if len(expected) != 0 {
		return fmt.Errorf("OpenAPI routes missing in Gin: %v", expected)
	}
	return nil
}

// TestAPIContractRoutes 在无数据库情况下检查所有路由声明以及动态 405 匹配。
// 测试不发出业务请求，因此不会触发状态写入。
func TestAPIContractRoutes(t *testing.T) {
	cfg := config.DefaultPanelConfig()
	router, err := NewPanelRouter(cfg, nil, &control.Service{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err = assertAPIContract(router); err != nil {
		t.Fatal(err)
	}
	if !routeMatches("/api/v1/apps/:id", "/api/v1/apps/example") || routeMatches("/api/v1/apps/:id", "/api/v1/apps/a/b") {
		t.Fatal("dynamic method path mismatch")
	}
}
