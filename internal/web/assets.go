// Package web 提供内嵌 Vite SPA 和受控历史路由回退。
// API 路径由 API router 提前处理，不能落到 index.html。
package web

import (
	"encoding/json"
	"errors"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// Assets 验证构建来源后创建不可变的静态资源服务。
// 正式构建必须包含 api 模式 manifest，Mock 资源不允许随服务器发布。
func Assets() (http.Handler, error) {
	files, development, err := assetFS()
	if err != nil {
		return nil, err
	}
	if development {
		return nil, nil
	}
	manifest, err := fs.ReadFile(files, "release.json")
	if err != nil {
		return nil, errors.New("embedded API frontend manifest missing; run pnpm build:release")
	}
	var info struct {
		DataMode string `json:"dataMode"`
	}
	if json.Unmarshal(manifest, &info) != nil || info.DataMode != "api" {
		return nil, errors.New("only API mode frontend can be embedded")
	}
	if _, err := fs.Stat(files, "mockServiceWorker.js"); err == nil {
		return nil, errors.New("Mock service worker cannot be embedded")
	}
	if _, err = fs.Stat(files, "index.html"); err != nil {
		return nil, errors.New("embedded frontend index missing")
	}
	server := http.FileServerFS(files)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if name == "." || name == "" {
			name = "index.html"
		}
		if name == "release.json" {
			http.NotFound(w, r)
			return
		}
		info, err := fs.Stat(files, name)
		if err != nil || info.IsDir() {
			if strings.Contains(path.Base(name), ".") {
				http.NotFound(w, r)
				return
			}
			body, err := fs.ReadFile(files, "index.html")
			if err != nil {
				http.Error(w, "frontend unavailable", 500)
				return
			}
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Header().Set("Cache-Control", "no-store")
			if r.Method != http.MethodHead {
				_, _ = w.Write(body)
			}
			return
		}
		if strings.HasPrefix(name, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		server.ServeHTTP(w, r)
	}), nil
}
