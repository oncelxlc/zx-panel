package storage

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// SystemSQLiteName 是项目根目录下的运行时 SQLite 数据库文件名。
const SystemSQLiteName = "system.sqlite"

// EnsureSystemSQLite 确保项目根目录存在系统 SQLite 数据库文件。
func EnsureSystemSQLite() (string, error) {
	// 固定查找 sqlite3 命令，不接收用户输入，避免命令注入风险。
	sqlitePath, err := exec.LookPath("sqlite3")
	if err != nil {
		return "", fmt.Errorf("sqlite3 command not found; install SQLite and make sure sqlite3 is available in PATH (Windows: winget install SQLite.SQLite; macOS: brew install sqlite; Debian/Ubuntu: sudo apt install sqlite3)")
	}

	workingDir, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("get working directory: %w", err)
	}

	rootDir, err := findProjectRoot(workingDir)
	if err != nil {
		return "", err
	}

	return ensureSystemSQLiteAt(rootDir, sqlitePath)
}

// ensureSystemSQLiteAt 在指定项目根目录创建或复用系统 SQLite 文件。
func ensureSystemSQLiteAt(rootDir string, sqlitePath string) (string, error) {
	dbPath := filepath.Join(rootDir, SystemSQLiteName)

	info, err := os.Stat(dbPath)
	if err == nil {
		if info.IsDir() {
			return "", fmt.Errorf("%s exists but is a directory", dbPath)
		}

		return dbPath, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return "", fmt.Errorf("check %s: %w", dbPath, err)
	}

	// 使用 exec.Command 参数数组调用 sqlite3，不经过 shell 拼接。
	cmd := exec.Command(sqlitePath, dbPath, "PRAGMA user_version = 1;")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("create %s with sqlite3: %w%s", dbPath, err, commandOutputSuffix(output))
	}

	if info, err = os.Stat(dbPath); err != nil {
		return "", fmt.Errorf("verify %s after create: %w", dbPath, err)
	}
	if info.IsDir() {
		return "", fmt.Errorf("%s was created as a directory", dbPath)
	}

	return dbPath, nil
}

// findProjectRoot 从起始目录向上查找包含 go.mod 的项目根目录。
func findProjectRoot(startDir string) (string, error) {
	dir, err := filepath.Abs(startDir)
	if err != nil {
		return "", fmt.Errorf("resolve project root from %s: %w", startDir, err)
	}

	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir, nil
		} else if !errors.Is(err, os.ErrNotExist) {
			return "", fmt.Errorf("check go.mod in %s: %w", dir, err)
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("project root with go.mod not found from %s", startDir)
		}
		dir = parent
	}
}

// commandOutputSuffix 将命令输出整理为错误消息后缀，避免空输出污染错误文本。
func commandOutputSuffix(output []byte) string {
	output = bytes.TrimSpace(output)
	if len(output) == 0 {
		return ""
	}

	return ": " + strings.TrimSpace(string(output))
}
