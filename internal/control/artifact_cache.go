package control

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"sort"
)

// artifactName 只接受 SHA-256 地址，缓存键不能变成任意路径。
// 摘要必须来自官方适配器，浏览器不能指定下载 URL。
func artifactName(digest string) string {
	if len(digest) != 64 {
		return ""
	}
	if _, err := hex.DecodeString(digest); err != nil {
		return ""
	}
	return digest + ".tar.gz"
}

// artifactCached 只报告已经原子提交的缓存文件，临时文件不算离线资源。
// 执行安装时仍逐字节重新核对摘要，不能只信任文件名。
func (s *Service) artifactCached(digest string) bool {
	name := artifactName(digest)
	if name == "" {
		return false
	}
	info, err := os.Lstat(filepath.Join(s.Config.Paths.ArtifactCacheRoot, name))
	return err == nil && info.Mode().IsRegular() && info.Size() > 0 && info.Size() <= 512<<20
}

// copyVerified 有界复制并计算摘要，取消不会产生被认可的缓存结果。
// 调用方只有在校验成功后才能把输出当作可用归档。
func copyVerified(ctx context.Context, destination io.Writer, source io.Reader, digest string) (int64, error) {
	hash := sha256.New()
	buffer := make([]byte, 64<<10)
	var total int64
	for {
		if err := ctx.Err(); err != nil {
			return total, err
		}
		n, err := source.Read(buffer)
		if n > 0 {
			total += int64(n)
			if total > 512<<20 {
				return total, errors.New("artifact exceeds cache limit")
			}
			if _, writeErr := io.MultiWriter(destination, hash).Write(buffer[:n]); writeErr != nil {
				return total, writeErr
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return total, err
		}
	}
	if hex.EncodeToString(hash.Sum(nil)) != digest {
		return total, Fail(422, "CHECKSUM_MISMATCH", "缓存归档摘要不匹配，已停止安装")
	}
	return total, nil
}

// copyCachedArtifact 使用受限根目录打开缓存，损坏缓存会清除并明确失败。
// 不把校验失败隐藏成后台下载成功，用户可在清除后重新预检。
func (s *Service) copyCachedArtifact(ctx context.Context, target *os.File, artifact Artifact) (bool, error) {
	name := artifactName(artifact.SHA256)
	if name == "" {
		return false, errors.New("artifact checksum unavailable")
	}
	root, err := os.OpenRoot(s.Config.Paths.ArtifactCacheRoot)
	if err != nil {
		return false, err
	}
	defer root.Close()
	source, err := root.Open(name)
	if os.IsNotExist(err) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	defer source.Close()
	info, err := source.Stat()
	if err != nil || !info.Mode().IsRegular() {
		return false, errors.New("cache entry is not a regular file")
	}
	if _, err = copyVerified(ctx, target, source, artifact.SHA256); err != nil {
		source.Close()
		if !errors.Is(err, context.Canceled) && !errors.Is(err, context.DeadlineExceeded) {
			_ = root.Remove(name)
		}
		return false, err
	}
	return true, nil
}

// cacheArtifact 只缓存已经验证的安装包，默认总量上限为 2 GiB。
// 单 worker 串行写入；按最旧文件清理缓存，永远不清理安装或应用目录。
func (s *Service) cacheArtifact(ctx context.Context, path, digest string) error {
	name := artifactName(digest)
	if name == "" {
		return errors.New("invalid artifact checksum")
	}
	root, err := os.OpenRoot(s.Config.Paths.ArtifactCacheRoot)
	if err != nil {
		return err
	}
	defer root.Close()
	directory, err := root.Open(".")
	if err != nil {
		return err
	}
	entries, err := directory.ReadDir(-1)
	directory.Close()
	if err != nil {
		return err
	}
	files := []os.FileInfo{}
	var bytes int64
	for _, entry := range entries {
		if len(entry.Name()) != len(name) || artifactName(entry.Name()[:64]) != entry.Name() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if info.Mode().IsRegular() {
			files = append(files, info)
			bytes += info.Size()
		}
	}
	source, err := os.Open(path)
	if err != nil {
		return err
	}
	defer source.Close()
	info, err := source.Stat()
	if err != nil {
		return err
	}
	sort.Slice(files, func(i, j int) bool { return files[i].ModTime().Before(files[j].ModTime()) })
	for _, file := range files {
		if bytes+info.Size() <= 2<<30 {
			break
		}
		if err = root.Remove(file.Name()); err != nil {
			return err
		}
		bytes -= file.Size()
	}
	temporary, err := os.CreateTemp(s.Config.Paths.ArtifactCacheRoot, ".artifact-*")
	if err != nil {
		return err
	}
	defer os.Remove(temporary.Name())
	defer temporary.Close()
	if _, err = copyVerified(ctx, temporary, source, digest); err != nil {
		return err
	}
	if err = temporary.Sync(); err != nil {
		return err
	}
	if err = temporary.Close(); err != nil {
		return err
	}
	if err = root.Remove(name); err != nil && !os.IsNotExist(err) {
		return err
	}
	return root.Rename(filepath.Base(temporary.Name()), name)
}
