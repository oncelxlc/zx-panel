package control

import (
	"context"
	"io/fs"
	"path/filepath"
)

// directoryQuota 在受控目录中统计普通文件，保守拒绝读不全或预算不足的情况。
// 不跟随符号链接；最多扫描百万项，绝不自动删除运行时或应用。
func directoryQuota(ctx context.Context, root string, reserve, maximum int64) error {
	var size int64
	entries := 0
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if err = ctx.Err(); err != nil {
			return err
		}
		entries++
		if entries > 1000000 {
			return Fail(409, "QUOTA_CHECK_INCOMPLETE", "目录项过多，无法完整核实配额")
		}
		if entry.Type().IsRegular() {
			info, e := entry.Info()
			if e != nil {
				return e
			}
			size += info.Size()
			if size+reserve > maximum {
				return Fail(409, "STORAGE_QUOTA_EXCEEDED", "受控目录达到配额，请清理不再需要的资源后重试")
			}
		}
		return nil
	})
	return err
}
