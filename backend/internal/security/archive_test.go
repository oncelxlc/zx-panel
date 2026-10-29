package security

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
)

// TestArchiveBoundary 覆盖正常文件、路径穿越、链接逃逸及预算。
// 成功展开不能在目标根目录外创建文件。
func TestArchiveBoundary(t *testing.T) {
	for _, tc := range []struct {
		name   string
		header tar.Header
		limit  int64
		ok     bool
	}{{"file", tar.Header{Name: "node/bin/node", Size: 1, Mode: 0755, Typeflag: tar.TypeReg}, 10, true}, {"traversal", tar.Header{Name: "node/../../escape", Size: 1, Typeflag: tar.TypeReg}, 10, false}, {"link", tar.Header{Name: "node/bin/link", Linkname: "../../escape", Typeflag: tar.TypeSymlink}, 10, false}, {"device", tar.Header{Name: "node/device", Typeflag: tar.TypeChar}, 10, false}, {"budget", tar.Header{Name: "node/large", Size: 1, Typeflag: tar.TypeReg}, 0, false}} {
		t.Run(tc.name, func(t *testing.T) {
			var archive bytes.Buffer
			gz := gzip.NewWriter(&archive)
			tw := tar.NewWriter(gz)
			if err := tw.WriteHeader(&tc.header); err != nil {
				t.Fatal(err)
			}
			if tc.header.Size > 0 {
				if _, err := tw.Write([]byte("x")); err != nil {
					t.Fatal(err)
				}
			}
			if err := tw.Close(); err != nil {
				t.Fatal(err)
			}
			if err := gz.Close(); err != nil {
				t.Fatal(err)
			}
			dir := t.TempDir()
			err := ExtractTarGzip(context.Background(), &archive, dir, "node", tc.limit, 10)
			if (err == nil) != tc.ok {
				t.Fatalf("error=%v", err)
			}
			if tc.ok {
				if _, err := os.Stat(filepath.Join(dir, "bin", "node")); err != nil {
					t.Fatal(err)
				}
			}
		})
	}
}

// cancelArchiveReader 在第一次实际读取后撤销上下文，模拟解包期间到达截止时间。
// 只用于确认解包不会继续处理已读入的压缩缓冲。
type cancelArchiveReader struct {
	source io.Reader
	cancel context.CancelFunc
}

// Read 保留真实归档字节，使测试失败来自取消而非坏包。
// 首次和后续调用均可安全重复撤销。
func (r cancelArchiveReader) Read(buffer []byte) (int, error) {
	n, err := r.source.Read(buffer)
	r.cancel()
	return n, err
}

// TestArchiveCancellation 覆盖读取前和读取中取消，防止提交超时后仍继续解包。
// 正常归档已由边界测试覆盖；取消不得生成可安装文件。
func TestArchiveCancellation(t *testing.T) {
	var archive bytes.Buffer
	gz := gzip.NewWriter(&archive)
	tw := tar.NewWriter(gz)
	if err := tw.WriteHeader(&tar.Header{Name: "node/bin/node", Size: 1, Mode: 0755}); err != nil {
		t.Fatal(err)
	}
	if _, err := tw.Write([]byte("x")); err != nil {
		t.Fatal(err)
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
	for _, alreadyCanceled := range []bool{true, false} {
		ctx, cancel := context.WithCancel(context.Background())
		if alreadyCanceled {
			cancel()
		}
		destination := t.TempDir()
		err := ExtractTarGzip(ctx, cancelArchiveReader{bytes.NewReader(archive.Bytes()), cancel}, destination, "node", 10, 10)
		cancel()
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("expected cancellation, got %v", err)
		}
		files, err := os.ReadDir(destination)
		if err != nil || len(files) != 0 {
			t.Fatalf("canceled archive produced files: %v", err)
		}
	}
}
