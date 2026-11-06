package control

import (
	"os"
	"path/filepath"
	"strings"
)

// pathWithin 按路径组件判断包含关系，禁止字符串前缀误判。
// 不替代真实路径解析或 os.Root 的访问保护。
func pathWithin(root, path string) bool {
	rel, err := filepath.Rel(root, path)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}

// canonicalDirectory 解析已有目录，并要求位于配置批准根目录内。
// 目录必须真实存在，符号链接最终目标同样受边界限制。
func canonicalDirectory(path string, roots []string) (string, error) {
	if !filepath.IsAbs(path) {
		return "", Fail(422, "INVALID_PATH", "目录必须为绝对路径")
	}
	real, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", Fail(422, "INVALID_PATH", "目录不存在或无法读取")
	}
	info, err := os.Stat(real)
	if err != nil || !info.IsDir() {
		return "", Fail(422, "INVALID_PATH", "必须选择已有目录")
	}
	for _, root := range roots {
		resolved, err := filepath.EvalSymlinks(root)
		if err == nil && pathWithin(resolved, real) {
			return real, nil
		}
	}
	return "", Fail(403, "PATH_NOT_ALLOWED", "目录不在批准的应用根目录内")
}
