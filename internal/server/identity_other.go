//go:build !linux

package server

import (
	"errors"
	"zx-panel/internal/config"
)

// verifyServerIdentity 将非 Linux 主程序限制为开发预览。
// 不以 Windows 开发成功代替生产 Linux 的身份与 systemd 校验。
func verifyServerIdentity(cfg config.PanelConfig) error {
	if cfg.Mode != "development" {
		return errors.New("production server requires native Linux")
	}
	return nil
}

// verifyLocalIdentity 非 Linux 只允许本机开发配置运行维护命令。
// 正式初始化和主机管理必须在 Linux 部署环境执行。
func verifyLocalIdentity(cfg config.PanelConfig) error {
	if cfg.Mode != "development" {
		return errors.New("production maintenance requires Linux")
	}
	return nil
}
