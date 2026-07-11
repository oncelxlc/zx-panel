package storage

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// TestFindProjectRoot 验证项目根目录可从嵌套目录向上定位。
// 测试以临时 go.mod 作为明确的项目根标记。
func TestFindProjectRoot(t *testing.T) {
	rootDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(rootDir, "go.mod"), []byte("module test\n"), 0o644); err != nil {
		t.Fatalf("write go.mod: %v", err)
	}

	nestedDir := filepath.Join(rootDir, "internal", "storage")
	if err := os.MkdirAll(nestedDir, 0o755); err != nil {
		t.Fatalf("create nested dir: %v", err)
	}

	got, err := findProjectRoot(nestedDir)
	if err != nil {
		t.Fatalf("find project root: %v", err)
	}
	if got != rootDir {
		t.Fatalf("project root = %q, want %q", got, rootDir)
	}
}

// TestEnsureSystemSQLiteAtCreatesDatabase 验证缺少文件时会创建 SQLite。
// 测试使用假 sqlite3 命令，避免依赖本机工具安装状态。
func TestEnsureSystemSQLiteAtCreatesDatabase(t *testing.T) {
	rootDir := t.TempDir()
	sqlitePath := writeFakeSQLite(t)

	dbPath, err := ensureSystemSQLiteAt(rootDir, sqlitePath)
	if err != nil {
		t.Fatalf("ensure system sqlite: %v", err)
	}

	want := filepath.Join(rootDir, SystemSQLiteName)
	if dbPath != want {
		t.Fatalf("db path = %q, want %q", dbPath, want)
	}
	if _, err := os.Stat(want); err != nil {
		t.Fatalf("stat created database: %v", err)
	}
}

// TestEnsureSystemSQLiteAtRejectsDirectory 验证同名目录会被拒绝。
// 该边界避免后续逻辑把目录误当作可连接的数据库文件。
func TestEnsureSystemSQLiteAtRejectsDirectory(t *testing.T) {
	rootDir := t.TempDir()
	if err := os.Mkdir(filepath.Join(rootDir, SystemSQLiteName), 0o755); err != nil {
		t.Fatalf("create system sqlite directory: %v", err)
	}

	if _, err := ensureSystemSQLiteAt(rootDir, "sqlite3"); err == nil {
		t.Fatal("expected directory error")
	}
}

// writeFakeSQLite 生成测试使用的 sqlite3 替身命令。
// 实现根据操作系统分别输出批处理或 shell 脚本。
func writeFakeSQLite(t *testing.T) string {
	t.Helper()

	dir := t.TempDir()
	if runtime.GOOS == "windows" {
		path := filepath.Join(dir, "sqlite3.bat")
		content := "@echo off\r\ncopy NUL \"%~1\" >NUL\r\n"
		if err := os.WriteFile(path, []byte(content), 0o755); err != nil {
			t.Fatalf("write fake sqlite: %v", err)
		}
		return path
	}

	path := filepath.Join(dir, "sqlite3")
	content := "#!/bin/sh\n: > \"$1\"\n"
	if err := os.WriteFile(path, []byte(content), 0o755); err != nil {
		t.Fatalf("write fake sqlite: %v", err)
	}

	return path
}
