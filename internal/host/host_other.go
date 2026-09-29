//go:build !linux

package host

import (
	"context"
	"errors"
	"zx-panel/internal/config"
)

// Run 明确拒绝非 Linux 平台启动特权 helper。
// Windows 只提供受限开发预览。
func Run(context.Context, config.PanelConfig) error {
	return errors.New("privileged helper requires native Linux and systemd")
}
