//go:build linux

package server

import (
	"fmt"
	"golang.org/x/sys/unix"
	"os"
	"path/filepath"
)

// localLock 使用内核锁保护同一本机数据目录，进程异常退出会自动释放。
// root Web 服务在这里直接拒绝启动。
func localLock(root string) (func(), error) {
	if os.Geteuid() == 0 {
		return nil, fmt.Errorf("web service must run as a non-root account")
	}
	file, err := os.OpenFile(filepath.Join(root, "panel.lock"), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	if err = unix.Flock(int(file.Fd()), unix.LOCK_EX|unix.LOCK_NB); err != nil {
		file.Close()
		return nil, fmt.Errorf("data directory is already in use")
	}
	return func() { _ = unix.Flock(int(file.Fd()), unix.LOCK_UN); _ = file.Close() }, nil
}
