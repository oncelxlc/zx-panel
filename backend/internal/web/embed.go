//go:build !devassets

package web

import (
	"embed"
	"io/fs"
)

// bundled 包含经过 api 模式构建与资源扫描的前端文件。
// 缺少资源时 go build 会失败，不回退到示例页面。
//
//go:embed all:ui/dist
var bundled embed.FS

// assetFS 为正式二进制提供嵌入目录的受限视图。
// 不从运行时磁盘补充未经审核的 JavaScript。
func assetFS() (fs.FS, bool, error) { sub, err := fs.Sub(bundled, "ui/dist"); return sub, false, err }
