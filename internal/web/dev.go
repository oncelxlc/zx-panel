//go:build devassets

package web

import "io/fs"

// assetFS 在显式开发构建中关闭内嵌资源，由 Vite 提供 UI。
// 该标签不能用于发布验收。
func assetFS() (fs.FS, bool, error) { return nil, true, nil }
