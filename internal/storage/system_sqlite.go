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

const SystemSQLiteName = "system.sqlite"

func EnsureSystemSQLite() (string, error) {
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

func commandOutputSuffix(output []byte) string {
	output = bytes.TrimSpace(output)
	if len(output) == 0 {
		return ""
	}

	return ": " + strings.TrimSpace(string(output))
}
