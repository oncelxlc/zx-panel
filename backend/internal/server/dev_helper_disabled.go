//go:build !devassets || !linux

package server

import "context"

// buildDevelopmentHelper 在正式构建和非 Linux 预览中不执行开发构建。
// 正式部署继续使用发布产物，Windows 预览不生成不可用的 helper。
func buildDevelopmentHelper(context.Context) error { return nil }
