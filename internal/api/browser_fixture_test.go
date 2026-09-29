package api

import (
	"context"
	"crypto/sha256"
	"github.com/gin-gonic/gin"
	"net"
	"net/http"
	"os"
	"testing"
	"time"
	"zx-panel/internal/control"
	"zx-panel/internal/web"
)

// TestBrowserFixture 为浏览器端到端测试提供真实 API 和独立 PostgreSQL。
// 明确启用才监听回环；完成或超时均退出并清理随机测试数据库。
func TestBrowserFixture(t *testing.T) {
	if os.Getenv("ZX_PANEL_BROWSER_FIXTURE") != "1" {
		t.Skip("real browser fixture disabled")
	}
	database, cfg := integrationDatabase(t)
	cfg.HTTP.PublicOrigin = "http://127.0.0.1:7202"
	cfg.HTTP.AllowedHosts = []string{"127.0.0.1:7202"}
	vault, err := control.OpenVault(cfg.Paths.SecretKeyFile, true)
	if err != nil {
		t.Fatal(err)
	}
	service, err := control.NewService(cfg, database.Pool(), vault, "browser-test")
	if err != nil {
		t.Fatal(err)
	}
	if err = service.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	defer service.Close()
	token := sha256.Sum256([]byte("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"))
	if err = database.SaveSetupToken(context.Background(), token[:]); err != nil {
		t.Fatal(err)
	}
	assets, err := web.Assets()
	if err != nil || assets == nil {
		t.Fatal("real API embed assets required; build assets and run without devassets", err)
	}
	router, err := NewPanelRouter(cfg, database, service, assets)
	if err != nil {
		t.Fatal(err)
	}
	finished := make(chan struct{}, 1)
	router.POST("/__test/finish", func(c *gin.Context) {
		select {
		case finished <- struct{}{}:
		default:
		}
		c.Status(204)
	})
	listener, err := net.Listen("tcp", "127.0.0.1:7202")
	if err != nil {
		t.Fatal(err)
	}
	server := &http.Server{Handler: router, ReadHeaderTimeout: 5 * time.Second}
	defer server.Close()
	go func() { _ = server.Serve(listener) }()
	t.Log("Isolated API browser fixture ready at http://127.0.0.1:7202")
	select {
	case <-finished:
	case <-time.After(3 * time.Minute):
		t.Error("browser fixture timed out")
	}
}
