package security

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// ExtractTarGzip 展开受限归档，只允许预期顶层目录内的普通文件和相对链接。
// os.Root 防止路径及符号链接竞争逃逸；特殊设备和硬链接一律拒绝。
func ExtractTarGzip(ctx context.Context, source io.Reader, destination, top string, maxBytes int64, maxFiles int) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if top == "" || strings.ContainsAny(top, "/\\\x00") {
		return errors.New("invalid archive root")
	}
	root, err := os.OpenRoot(destination)
	if err != nil {
		return err
	}
	defer root.Close()
	// helper 使用 0077 umask；归档权限必须显式规范化，才能由非 root 应用读取与执行。
	if err = root.Chmod(".", 0755); err != nil {
		return err
	}
	directories := map[string]bool{".": true}
	makeDirectory := func(name string) error {
		if directories[name] {
			return nil
		}
		if err := root.MkdirAll(name, 0755); err != nil {
			return err
		}
		for current := name; !directories[current]; current = path.Dir(current) {
			if err := root.Chmod(current, 0755); err != nil {
				return err
			}
			directories[current] = true
		}
		return nil
	}
	gz, err := gzip.NewReader(archiveReader{ctx: ctx, source: source})
	if err != nil {
		return err
	}
	defer gz.Close()
	tr := tar.NewReader(gz)
	var total int64
	seen := map[string]bool{}
	for count := 0; ; count++ {
		if err := ctx.Err(); err != nil {
			return err
		}
		header, err := tr.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		if count >= maxFiles {
			return errors.New("archive file count exceeded")
		}
		name := strings.TrimSuffix(header.Name, "/")
		if name == top {
			if header.Typeflag != tar.TypeDir {
				return errors.New("archive root must be a directory")
			}
			continue
		}
		if strings.ContainsAny(name, "\\\x00") || !strings.HasPrefix(name, top+"/") {
			return errors.New("archive path outside expected root")
		}
		name = strings.TrimPrefix(name, top+"/")
		if !filepath.IsLocal(name) || path.Clean(name) != name || seen[name] {
			return errors.New("unsafe or duplicate archive path")
		}
		seen[name] = true
		if header.Size < 0 || header.Size > maxBytes-total {
			return errors.New("archive byte budget exceeded")
		}
		total += header.Size
		parent := path.Dir(name)
		if parent != "." {
			if err = makeDirectory(parent); err != nil {
				return err
			}
		}
		switch header.Typeflag {
		case tar.TypeDir:
			if err = makeDirectory(name); err != nil {
				return err
			}
		case tar.TypeReg, tar.TypeRegA:
			mode := os.FileMode(0644)
			if header.Mode&0111 != 0 {
				mode = 0755
			}
			file, err := root.OpenFile(name, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode)
			if err != nil {
				return err
			}
			_, copyErr := io.CopyN(file, tr, header.Size)
			if copyErr == nil {
				copyErr = file.Chmod(mode)
			}
			closeErr := file.Close()
			if copyErr != nil {
				return copyErr
			}
			if closeErr != nil {
				return closeErr
			}
		case tar.TypeSymlink:
			target := header.Linkname
			if target == "" || strings.ContainsAny(target, "\\\x00") || path.IsAbs(target) || !filepath.IsLocal(path.Join(parent, target)) {
				return errors.New("archive link escapes destination")
			}
			if err = root.Symlink(target, name); err != nil {
				return err
			}
		default:
			return fmt.Errorf("unsupported archive entry type %d", header.Typeflag)
		}
	}
}

// archiveReader 在压缩流读取边界停止过期操作。
// 解包同时在每个文件边界检查上下文，避免缓冲数据延迟取消。
type archiveReader struct {
	ctx    context.Context
	source io.Reader
}

// Read 只转发仍在预算内的读取，不额外缓存归档内容。
// 文件读取由调用方关闭；取消后不继续消耗解压资源。
func (r archiveReader) Read(buffer []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.source.Read(buffer)
}
