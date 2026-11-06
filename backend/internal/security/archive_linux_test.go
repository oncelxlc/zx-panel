//go:build linux

package security

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"os"
	"path/filepath"
	"syscall"
	"testing"
)

// TestArchiveRestrictiveUmask 保证 helper 的 0077 umask 不破坏非 root 运行时执行。
// 不并行运行；完成后恢复进程 umask，归档中的写权限和特殊权限不会保留。
func TestArchiveRestrictiveUmask(t *testing.T) {
	previous := syscall.Umask(0077)
	defer syscall.Umask(previous)
	var buffer bytes.Buffer
	gz := gzip.NewWriter(&buffer)
	tarball := tar.NewWriter(gz)
	for _, entry := range []tar.Header{{Name: "node/lib/nested/data", Mode: 0666, Size: 1, Typeflag: tar.TypeReg}, {Name: "node/bin/node", Mode: 07777, Size: 1, Typeflag: tar.TypeReg}} {
		if err := tarball.WriteHeader(&entry); err != nil {
			t.Fatal(err)
		}
		if _, err := tarball.Write([]byte("x")); err != nil {
			t.Fatal(err)
		}
	}
	if err := tarball.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
	destination := t.TempDir()
	if err := ExtractTarGzip(context.Background(), &buffer, destination, "node", 10, 10); err != nil {
		t.Fatal(err)
	}
	for name, wanted := range map[string]os.FileMode{".": 0755, "lib": 0755, "lib/nested": 0755, "lib/nested/data": 0644, "bin": 0755, "bin/node": 0755} {
		stat, err := os.Stat(filepath.Join(destination, name))
		if err != nil || stat.Mode().Perm() != wanted || stat.Mode()&(os.ModeSetuid|os.ModeSetgid) != 0 {
			t.Fatalf("normalized permission mismatch for %s: %v", name, err)
		}
	}
}
