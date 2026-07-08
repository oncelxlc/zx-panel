package storage

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

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

func TestEnsureSystemSQLiteAtRejectsDirectory(t *testing.T) {
	rootDir := t.TempDir()
	if err := os.Mkdir(filepath.Join(rootDir, SystemSQLiteName), 0o755); err != nil {
		t.Fatalf("create system sqlite directory: %v", err)
	}

	if _, err := ensureSystemSQLiteAt(rootDir, "sqlite3"); err == nil {
		t.Fatal("expected directory error")
	}
}

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
