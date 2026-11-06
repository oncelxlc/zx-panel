package control

import (
	"context"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"errors"

	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"slices"
	"sort"
	"strconv"
	"strings"
	"time"
)

// releaseVersion 仅接受官方目录中的明确稳定数字版本。
// 不将预发布字符串拼接进下载路径。
var releaseVersion = regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+$`)

// officialClient 禁用环境代理，并限制所有跳转到固定 HTTPS 官方来源。
// 连接前校验实际解析地址，不能转向回环或私有网络。
var officialClient = &http.Client{Timeout: 15 * time.Minute, Transport: &http.Transport{Proxy: nil, TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS12}, TLSHandshakeTimeout: 10 * time.Second, ResponseHeaderTimeout: 20 * time.Second, IdleConnTimeout: 30 * time.Second, MaxIdleConns: 4, DisableCompression: true, DialContext: officialDial}, CheckRedirect: func(request *http.Request, via []*http.Request) error {
	if len(via) > 3 || !trustedURL(request.URL) {
		return errors.New("untrusted redirect")
	}
	return nil
}}

// trustedURL 校验固定主机、HTTPS 与路径边界。
// 用户凭据、自定义端口和相对地址均不允许。
func trustedURL(u *url.URL) bool {
	if u.Scheme != "https" || u.User != nil || u.Fragment != "" || u.Port() != "" && u.Port() != "443" {
		return false
	}
	switch u.Hostname() {
	case "nodejs.org":
		return strings.HasPrefix(u.Path, "/dist/") && u.RawQuery == ""
	case "go.dev":
		return strings.HasPrefix(u.Path, "/dl/")
	case "dl.google.com":
		return strings.HasPrefix(u.Path, "/go/") && u.RawQuery == ""
	default:
		return false
	}
}

// officialDial 对 DNS 结果逐个检查，连接使用已验证的具体 IP。
// TLS 仍以原始官方主机名验证证书。
func officialDial(ctx context.Context, network, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, err
	}
	addresses, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return nil, err
	}
	dialer := net.Dialer{Timeout: 10 * time.Second}
	for _, address := range addresses {
		ip := address.IP
		if !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
			continue
		}
		connection, e := dialer.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
		if e == nil {
			return connection, nil
		}
		err = e
	}
	if err == nil {
		err = errors.New("official host resolved to forbidden address")
	}
	return nil, err
}

// officialGet 只接收适配器生成的 URL，并检查 HTTP 状态。
// 错误正文不写入日志或公开响应。
func officialGet(ctx context.Context, address string) (*http.Response, error) {
	u, err := url.Parse(address)
	if err != nil || !trustedURL(u) {
		return nil, Fail(422, "SOURCE_NOT_ALLOWED", "下载来源不在可信列表")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, address, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("User-Agent", "zx-panel/1.1")
	response, err := officialClient.Do(request)
	if err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, Fail(503, "CATALOG_UNAVAILABLE", "官方来源暂时不可达")
	}
	if response.StatusCode != 200 {
		response.Body.Close()
		return nil, Fail(503, "CATALOG_UNAVAILABLE", "官方来源返回失败状态")
	}
	return response, nil
}

// officialJSON 有界读取官方目录，不信任未限制大小的远端 JSON。
// 上游增加未知字段不会破坏兼容，但字段值仍经过规范化验证。
func officialJSON(ctx context.Context, address string, target any) error {
	response, err := officialGet(ctx, address)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 8<<20+1))
	if err != nil {
		return err
	}
	if len(body) > 8<<20 {
		return Fail(503, "CATALOG_INVALID", "官方目录超过体积限制")
	}
	return json.Unmarshal(body, target)
}

// versionParts 按整数比较版本，避免字典序误判 9 与 10。
// 调用前必须通过 releaseVersion 校验。
func versionParts(version string) [3]int {
	var result [3]int
	for i, part := range strings.Split(strings.TrimPrefix(version, "v"), ".") {
		if i >= 3 {
			break
		}
		result[i], _ = strconv.Atoi(part)
	}
	return result
}

// newer 对规范化稳定版本作严格降序比较。
// 相同版本保持平台 ID 的既定顺序。
func newer(a, b string) bool {
	x, y := versionParts(a), versionParts(b)
	for i := range x {
		if x[i] != y[i] {
			return x[i] > y[i]
		}
	}
	return false
}

// fetchCatalog 将 Node 与 Go 官方模型映射成同一发布契约。
// Node 维护周期未知时不宣称受支持，Go 不使用 LTS 标签。
func fetchCatalog(ctx context.Context, kind string) ([]Artifact, error) {
	result := []Artifact{}
	arch := runtime.GOARCH
	if arch != "amd64" && arch != "arm64" {
		arch = "amd64"
	}
	if kind == "node" {
		var rows []struct {
			Version string          `json:"version"`
			Files   []string        `json:"files"`
			LTS     json.RawMessage `json:"lts"`
		}
		if err := officialJSON(ctx, "https://nodejs.org/dist/index.json", &rows); err != nil {
			return nil, err
		}
		platform := "linux-" + arch
		if arch == "amd64" {
			platform = "linux-x64"
		}
		for _, row := range rows {
			version := strings.TrimPrefix(row.Version, "v")
			if !releaseVersion.MatchString(version) || !slices.Contains(row.Files, platform) {
				continue
			}
			channel := "current"
			if len(row.LTS) > 2 && string(row.LTS) != "false" && string(row.LTS) != "null" {
				channel = "lts"
			}
			base := "node-v" + version + "-" + platform
			size := int64(512 << 20)
			result = append(result, Artifact{Release: Release{ID: "node:" + version + ":" + platform, Kind: "node", Version: version, Platform: platform, Channel: channel, Maintenance: "unknown", InstalledBytesEstimate: &size, Compatible: true}, URL: "https://nodejs.org/dist/v" + version + "/" + base + ".tar.gz", ArchiveRoot: base})
		}
	} else if kind == "go" {
		var rows []struct {
			Version string `json:"version"`
			Stable  bool   `json:"stable"`
			Files   []struct {
				Filename string `json:"filename"`
				OS       string `json:"os"`
				Arch     string `json:"arch"`
				Kind     string `json:"kind"`
				SHA256   string `json:"sha256"`
				Size     int64  `json:"size"`
			} `json:"files"`
		}
		if err := officialJSON(ctx, "https://go.dev/dl/?mode=json&include=all", &rows); err != nil {
			return nil, err
		}
		for _, row := range rows {
			version := strings.TrimPrefix(row.Version, "go")
			if !row.Stable || !releaseVersion.MatchString(version) {
				continue
			}
			for _, file := range row.Files {
				if file.OS != "linux" || file.Arch != arch || file.Kind != "archive" || file.Filename != "go"+version+".linux-"+arch+".tar.gz" || len(file.SHA256) != 64 || file.Size <= 0 || file.Size > 512<<20 {
					continue
				}
				if _, err := hex.DecodeString(file.SHA256); err != nil {
					continue
				}
				size, estimate := file.Size, int64(512<<20)
				result = append(result, Artifact{Release: Release{ID: "go:" + version + ":linux-" + arch, Kind: "go", Version: version, Platform: "linux-" + arch, Channel: "stable", Maintenance: "unknown", DownloadBytes: &size, InstalledBytesEstimate: &estimate, Compatible: true}, URL: "https://go.dev/dl/" + file.Filename, SHA256: file.SHA256, ArchiveRoot: "go"})
			}
		}
	} else {
		return nil, Fail(422, "INVALID_INPUT", "不支持的运行时类别")
	}
	sort.Slice(result, func(i, j int) bool { return newer(result[i].Release.Version, result[j].Release.Version) })
	if len(result) == 0 {
		return nil, Fail(503, "CATALOG_INVALID", "官方目录没有可验证版本")
	}
	if len(result) > 2000 {
		result = result[:2000]
	}
	return result, nil
}

// RefreshCatalog 整批事务替换目录，失败时保留已有缓存与检查时间。
// 日志只记录错误代码，不把网络响应写进审计。
func (s *Service) RefreshCatalog(ctx context.Context, kind string) error {
	fetchCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	artifacts, err := fetchCatalog(fetchCtx, kind)
	if err != nil {
		_, dbErr := s.Repo.DB.Exec(ctx, "INSERT INTO app.catalog_status(kind,error_code) VALUES($1,'CATALOG_UNAVAILABLE') ON CONFLICT(kind) DO UPDATE SET error_code=EXCLUDED.error_code", kind)
		if dbErr != nil {
			return dbErr
		}
		return err
	}
	previous, err := listJSON[Artifact](ctx, s.Repo.DB, "SELECT payload FROM app.runtime_catalog WHERE kind=$1", kind)
	if err != nil {
		return err
	}
	verified := map[string]Artifact{}
	for _, artifact := range previous {
		if artifact.SHA256 != "" {
			verified[artifact.Release.ID] = artifact
		}
	}
	for i := range artifacts {
		old, ok := verified[artifacts[i].Release.ID]
		if ok && artifacts[i].SHA256 == "" && old.URL == artifacts[i].URL {
			artifacts[i].SHA256 = old.SHA256
		}
	}
	tx, err := s.Repo.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "DELETE FROM app.runtime_catalog WHERE kind=$1", kind); err != nil {
		return err
	}
	at := time.Now().UTC()
	for _, artifact := range artifacts {
		body, err := json.Marshal(artifact)
		if err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, "INSERT INTO app.runtime_catalog(id,kind,checked_at,payload) VALUES($1,$2,$3,$4)", artifact.Release.ID, kind, at, body); err != nil {
			return err
		}
	}
	if _, err = tx.Exec(ctx, "INSERT INTO app.catalog_status(kind,checked_at,error_code) VALUES($1,$2,NULL) ON CONFLICT(kind) DO UPDATE SET checked_at=EXCLUDED.checked_at,error_code=NULL", kind, at); err != nil {
		return err
	}
	if err = tx.Commit(ctx); err != nil {
		return err
	}
	return s.Events.Publish("runtime.changed", map[string]string{"kind": kind})
}

// CatalogPage 将可分页版本与缓存状态一起返回。
// 兼容性根据本机实际平台重新计算。
type CatalogPage struct {
	Page[Release]
	CheckedAt  *time.Time `json:"checkedAt"`
	CacheState string     `json:"cacheState"`
}

// Catalog 读取缓存不触发隐式网络下载。
// 空缓存要求用户发起可跟踪的检查任务。
func (s *Service) Catalog(ctx context.Context, kind string, limit, offset int) (CatalogPage, error) {
	result := CatalogPage{Page: Page[Release]{Items: []Release{}}, CacheState: "unavailable"}
	if kind != "node" && kind != "go" {
		return result, Fail(404, "RESOURCE_NOT_FOUND", "运行时类别不存在")
	}
	artifacts, err := listJSON[Artifact](ctx, s.Repo.DB, "SELECT payload FROM app.runtime_catalog WHERE kind=$1", kind)
	if err != nil {
		return result, err
	}
	sort.Slice(artifacts, func(i, j int) bool { return newer(artifacts[i].Release.Version, artifacts[j].Release.Version) })
	var code *string
	err = s.Repo.DB.QueryRow(ctx, "SELECT checked_at,error_code FROM app.catalog_status WHERE kind=$1", kind).Scan(&result.CheckedAt, &code)
	if err != nil && len(artifacts) > 0 {
		return result, err
	}
	if result.CheckedAt != nil {
		result.CacheState = "fresh"
		if time.Since(*result.CheckedAt) > 10*time.Minute || code != nil {
			result.CacheState = "stale"
		}
	}
	releases := []Release{}
	for _, artifact := range artifacts {
		release := artifact.Release
		release.VerifiedArtifactCached = s.artifactCached(artifact.SHA256)
		if reason := s.runtimeCompatibility(kind); reason != "" {
			release.Compatible = false
			release.IncompatibilityReason = &reason
		}
		releases = append(releases, release)
	}
	if offset < len(releases) {
		result.Page = paginate(releases[offset:min(offset+limit+1, len(releases))], limit, offset)
	}
	return result, nil
}

// resolveArtifact 将官方摘要固定进计划输入，执行阶段不能被目录刷新替换。
// Node 的 SHASUMS 来自与目录相同的官方 TLS 来源。
func (s *Service) resolveArtifact(ctx context.Context, id string) (Artifact, error) {
	artifact, err := decodeRow[Artifact](s.Repo.DB.QueryRow(ctx, "SELECT payload FROM app.runtime_catalog WHERE id=$1", id))
	if err != nil {
		return artifact, err
	}
	if artifact.SHA256 != "" {
		return artifact, nil
	}
	if artifact.Release.Kind != "node" {
		return artifact, Fail(503, "CHECKSUM_UNAVAILABLE", "缺少官方摘要")
	}
	response, err := officialGet(ctx, "https://nodejs.org/dist/v"+artifact.Release.Version+"/SHASUMS256.txt")
	if err != nil {
		return artifact, err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20+1))
	if err != nil || len(body) > 1<<20 {
		return artifact, Fail(503, "CHECKSUM_UNAVAILABLE", "官方摘要清单无效")
	}
	filename := artifact.ArchiveRoot + ".tar.gz"
	for _, line := range strings.Split(string(body), "\n") {
		fields := strings.Fields(line)
		if len(fields) == 2 && fields[1] == filename && len(fields[0]) == 64 {
			if _, err := hex.DecodeString(fields[0]); err == nil {
				artifact.SHA256 = strings.ToLower(fields[0])
				body, marshalErr := json.Marshal(artifact)
				if marshalErr != nil {
					return artifact, marshalErr
				}
				if _, err = s.Repo.DB.Exec(ctx, "UPDATE app.runtime_catalog SET payload=$2 WHERE id=$1", id, body); err != nil {
					return artifact, err
				}
				return artifact, nil
			}
		}
	}
	return artifact, Fail(503, "CHECKSUM_UNAVAILABLE", "官方摘要清单未包含该归档")
}

// downloadArtifact 把经过摘要验证的完整归档写入独立任务暂存目录。
// 每秒最多持久一次字节进度，取消和超限会删除不完整归档。
func (s *Service) downloadArtifact(ctx context.Context, task *Task, artifact Artifact) (string, error) {
	stage := filepath.Join(s.Config.Paths.StagingRoot, task.ID)
	if err := os.Mkdir(stage, 0700); err != nil {
		return "", err
	}
	file, err := os.OpenFile(filepath.Join(stage, "archive.tar.gz"), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return "", err
	}
	defer file.Close()
	if copied, cacheErr := s.copyCachedArtifact(ctx, file, artifact); cacheErr != nil {
		return "", cacheErr
	} else if copied {
		if err = file.Sync(); err != nil {
			return "", err
		}
		if err = file.Close(); err != nil {
			return "", err
		}
		return stage, s.taskStage(ctx, task, "verify", true, nil, nil)
	}
	response, err := officialGet(ctx, artifact.URL)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if response.ContentLength > 512<<20 {
		return "", Fail(422, "DOWNLOAD_TOO_LARGE", "官方归档超过 512 MiB 限制")
	}
	var total *int64
	if response.ContentLength >= 0 {
		length := response.ContentLength
		total = &length
	}
	hash := sha256.New()
	buffer := make([]byte, 64<<10)
	var downloaded int64
	last := time.Now()
	for {
		if err = ctx.Err(); err != nil {
			return "", err
		}
		n, readErr := response.Body.Read(buffer)
		if n > 0 {
			downloaded += int64(n)
			if downloaded > 512<<20 {
				return "", Fail(422, "DOWNLOAD_TOO_LARGE", "下载超过体积限制")
			}
			if _, err = file.Write(buffer[:n]); err != nil {
				return "", err
			}
			hash.Write(buffer[:n])
			if time.Since(last) >= time.Second {
				progress := downloaded
				if err = s.taskStage(ctx, task, "download", true, &progress, total); err != nil {
					return "", err
				}
				last = time.Now()
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return "", readErr
		}
	}
	if response.ContentLength >= 0 && downloaded != response.ContentLength {
		return "", Fail(503, "DOWNLOAD_INCOMPLETE", "下载未完整结束")
	}
	if hex.EncodeToString(hash.Sum(nil)) != artifact.SHA256 {
		return "", Fail(422, "CHECKSUM_MISMATCH", "安装包摘要与官方清单不一致")
	}
	if err = file.Sync(); err != nil {
		return "", err
	}
	if err = file.Close(); err != nil {
		return "", err
	}
	if cacheErr := s.cacheArtifact(ctx, filepath.Join(stage, "archive.tar.gz"), artifact.SHA256); cacheErr != nil {
		if err = s.taskLog(ctx, task.ID, "归档已验证；缓存写入失败，本次使用暂存归档继续安装"); err != nil {
			return "", err
		}
	}
	if err = s.taskStage(ctx, task, "verify", true, &downloaded, total); err != nil {
		return "", err
	}
	return stage, nil
}

// runtimeCompatibility 对明确支持的原生 Linux 与 glibc 组合开放安装。
// 无法证实兼容性时返回解释，不能凭架构名继续执行。
func (s *Service) runtimeCompatibility(kind string) string {
	info := s.Metrics.Info()
	if runtime.GOOS != "linux" || runtime.GOARCH != "amd64" && runtime.GOARCH != "arm64" {
		return "首发安装仅支持原生 Linux x86_64 / arm64"
	}
	if info.ObservationScope != "host" {
		return "容器或受限环境不开放主机安装"
	}
	if kind == "node" && (info.Libc == nil || info.Libc.Family != "glibc" || info.Libc.Version == nil) {
		return "无法确认 Node.js 所需 glibc 环境"
	}
	if kind == "node" && (!atLeastVersion(*info.Libc.Version, 2, 28) || !atLeastVersion(info.OS.Kernel, 4, 18)) {
		return "首发 Node.js 安装要求 glibc ≥ 2.28 和 Linux 内核 ≥ 4.18"
	}
	return ""
}

// atLeastVersion 比较平台公开版本的前两段，未知文本采取不兼容策略。
// 补丁与发行版后缀不参与最低版本判断。
func atLeastVersion(version string, major, minor int) bool {
	parts := strings.Split(version, ".")
	if len(parts) < 2 {
		return false
	}
	a, err := strconv.Atoi(parts[0])
	if err != nil {
		return false
	}
	b, err := strconv.Atoi(parts[1])
	return err == nil && (a > major || a == major && b >= minor)
}
