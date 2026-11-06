//go:build linux

package server

import (
	"errors"
	"os"
	"syscall"
	"zx-panel/internal/config"
)

// verifyServerIdentity 在任何外部探测或监听前禁止 Web 主进程以 root 运行。
// 启用 helper 时必须与部署声明的非 root UID 完全相符。
func verifyServerIdentity(cfg config.PanelConfig) error {
	uid := os.Geteuid()
	if uid == 0 {
		return errors.New("web server must run as a non-root service account")
	}
	if cfg.Helper.Enabled && uid != cfg.Helper.PanelUID {
		return errors.New("web process UID does not match privileged.panelUid")
	}
	return nil
}

// verifyLocalIdentity 限制本机秘密命令为 root、配置的面板账号或数据目录所有者。
// 持有网络会话不授予生成初始化凭据的本机权限。
func verifyLocalIdentity(cfg config.PanelConfig) error {
	uid := os.Geteuid()
	if uid == 0 || cfg.Helper.PanelUID > 0 && uid == cfg.Helper.PanelUID {
		return nil
	}
	info, err := os.Stat(cfg.Paths.DataRoot)
	if err == nil {
		if stat, ok := info.Sys().(*syscall.Stat_t); ok && int(stat.Uid) == uid && info.Mode().Perm()&0077 == 0 {
			return nil
		}
	}
	if cfg.Mode == "development" {
		return nil
	}
	return errors.New("local command requires root or the configured panel service identity")
}
