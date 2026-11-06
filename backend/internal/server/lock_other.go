//go:build !linux

package server

import (
	"fmt"
	"os"
	"path/filepath"
)

// localLock 在受限开发平台使用独占文件，并明确提示异常退出后的清理。
// PostgreSQL advisory lock 仍防止旧实例执行任务。
func localLock(root string) (func(), error) {
	path := filepath.Join(root, "panel.dev.lock")
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_RDWR, 0600)
	if err != nil {
		return nil, fmt.Errorf("development lock exists; verify no server is running before removing %s", path)
	}
	return func() { _ = file.Close(); _ = os.Remove(path) }, nil
}
