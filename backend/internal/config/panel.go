package config

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// HTTPConfig 定义唯一浏览器入口与受信代理边界。
// 生产必须由明确 HTTPS 入口访问，服务默认只绑定回环。
type HTTPConfig struct {
	Listen         string   `json:"listen"`
	PublicOrigin   string   `json:"publicOrigin"`
	AllowedHosts   []string `json:"allowedHosts"`
	TrustedProxies []string `json:"trustedProxies"`
	CookieSecure   bool     `json:"cookieSecure"`
}

// Paths 固定本机受控目录，所有相对路径以配置目录为基准。
// 应用根目录不受运行时卸载操作影响。
type Paths struct {
	DataRoot          string   `json:"dataRoot"`
	RuntimeRoot       string   `json:"runtimeRoot"`
	StagingRoot       string   `json:"stagingRoot"`
	ArtifactCacheRoot string   `json:"artifactCacheRoot"`
	ExportRoot        string   `json:"exportRoot"`
	AppRoots          []string `json:"appRoots"`
	SecretKeyFile     string   `json:"secretKeyFile"`
}

// HelperConfig 描述本机辅助服务连接与可操作服务身份。
// Socket 不对 TCP 网络公开。
type HelperConfig struct {
	Enabled         bool     `json:"enabled"`
	SocketPath      string   `json:"socketPath"`
	PanelUID        int      `json:"panelUid"`
	ServiceAccounts []string `json:"serviceAccounts"`
}

// PanelConfig 是受部署者控制的面板配置。
// DatabaseURL 不会返回前端或写入公开日志。
type PanelConfig struct {
	Mode        string       `json:"mode"`
	HTTP        HTTPConfig   `json:"http"`
	DatabaseURL string       `json:"databaseUrl"`
	Paths       Paths        `json:"paths"`
	Helper      HelperConfig `json:"privileged"`
	LogLevel    string       `json:"logLevel"`
}

// DefaultPanelConfig 使用可在 Windows 开发的回环安全默认值。
// 完整 Linux 控制必须另外启用受限辅助服务。
func DefaultPanelConfig() PanelConfig {
	return PanelConfig{Mode: "development", HTTP: HTTPConfig{Listen: "127.0.0.1:25000", PublicOrigin: "http://localhost:7200", AllowedHosts: []string{"localhost:7200", "127.0.0.1:25000", "localhost:25000"}, TrustedProxies: []string{}}, Paths: Paths{DataRoot: "./var", RuntimeRoot: "./var/runtimes", StagingRoot: "./var/staging", ArtifactCacheRoot: "./var/cache/artifacts", ExportRoot: "./var/exports", AppRoots: []string{"./var/apps"}, SecretKeyFile: "./local-secrets/app-secrets.key"}, Helper: HelperConfig{SocketPath: "/run/zx-panel-helper/control.sock", PanelUID: -1, ServiceAccounts: []string{}}, LogLevel: "info"}
}

// LoadFile 从明确配置文件装配严格配置，再应用有限环境覆盖。
// 不在加载阶段创建目录、执行迁移或生成管理员。
func LoadFile(path string) (ServerConfig, error) {
	return loadFile(path, true)
}

// LoadHelperFile 加载 helper 的受控目录与 UID 配置，不加载 .env 或数据库凭据。
// helper 没有数据库职责，不能要求部署者把数据库秘密传入其环境。
func LoadHelperFile(path string) (PanelConfig, error) {
	cfg, err := loadFile(path, false)
	cfg.Panel.DatabaseURL = ""
	return cfg.Panel, err
}

// loadFile 共享文件与路径解析，数据库装配仅允许主程序启用。
// 只有开发模式兼容当前目录 .env，生产和 helper 不隐式读取其他目录的秘密。
func loadFile(path string, withDatabase bool) (ServerConfig, error) {
	legacy := ServerConfig{Port: defaultPort}
	var base string
	var err error
	cfg := DefaultPanelConfig()
	if path != "" {
		absolute, err := filepath.Abs(path)
		if err != nil {
			return ServerConfig{}, err
		}
		file, err := os.Open(absolute)
		if err != nil {
			return ServerConfig{}, err
		}
		defer file.Close()
		dec := json.NewDecoder(io.LimitReader(file, 1<<20))
		dec.DisallowUnknownFields()
		if err = dec.Decode(&cfg); err != nil {
			return ServerConfig{}, fmt.Errorf("invalid config: %w", err)
		}
		var tail any
		if dec.Decode(&tail) != io.EOF {
			return ServerConfig{}, fmt.Errorf("config must contain exactly one object")
		}
		base = filepath.Dir(absolute)
	} else {
		base, err = os.Getwd()
		if err != nil {
			return ServerConfig{}, err
		}
	}
	if withDatabase {
		if cfg.Mode == "development" {
			legacy, err = LoadServerConfig()
			if err != nil {
				return ServerConfig{}, err
			}
		} else {
			legacy.DatabaseURL = os.Getenv("DATABASE_URL")
		}
	}
	if withDatabase && cfg.DatabaseURL == "" {
		if cfg.Mode == "production" && os.Getenv("DATABASE_URL") == "" {
			return ServerConfig{}, fmt.Errorf("production requires explicit databaseUrl or DATABASE_URL")
		}
		cfg.DatabaseURL = legacy.DatabaseURL
	}
	if v := os.Getenv("DATABASE_URL"); withDatabase && v != "" {
		cfg.DatabaseURL = v
	}
	if withDatabase && cfg.Mode == "development" && os.Getenv("PORT") != "" {
		cfg.HTTP.Listen = "127.0.0.1:" + legacy.Port
	}
	if v := os.Getenv("ZX_PANEL_LISTEN"); v != "" {
		cfg.HTTP.Listen = v
	}
	if v := os.Getenv("ZX_PANEL_PUBLIC_ORIGIN"); v != "" {
		cfg.HTTP.PublicOrigin = v
	}
	if v := os.Getenv("ZX_PANEL_LOG_LEVEL"); v != "" {
		cfg.LogLevel = v
	}
	for _, p := range []*string{&cfg.Paths.DataRoot, &cfg.Paths.RuntimeRoot, &cfg.Paths.StagingRoot, &cfg.Paths.ArtifactCacheRoot, &cfg.Paths.ExportRoot, &cfg.Paths.SecretKeyFile} {
		if !filepath.IsAbs(*p) {
			*p = filepath.Join(base, *p)
		}
		*p = filepath.Clean(*p)
	}
	for i, p := range cfg.Paths.AppRoots {
		if !filepath.IsAbs(p) {
			p = filepath.Join(base, p)
		}
		cfg.Paths.AppRoots[i] = filepath.Clean(p)
	}
	if err := cfg.validate(withDatabase); err != nil {
		return ServerConfig{}, err
	}
	legacy.Panel = cfg
	legacy.DatabaseURL = cfg.DatabaseURL
	legacy.SessionTTL = 12 * time.Hour
	return legacy, nil
}

// Validate 拒绝不安全入口、冲突路径和秘密缺失配置。
// 权限与真实文件系统关系还需在启动和动作预检时检查。
func (c PanelConfig) Validate() error {
	return c.validate(true)
}

// validate 验证两类进程共用的目录与入口边界。
// helper 跳过唯一不需要的数据库连接检查。
func (c PanelConfig) validate(withDatabase bool) error {
	var level slog.Level
	if err := level.UnmarshalText([]byte(c.LogLevel)); err != nil {
		return fmt.Errorf("invalid logLevel")
	}
	if c.Mode != "development" && c.Mode != "production" {
		return fmt.Errorf("mode must be development or production")
	}
	host, _, err := net.SplitHostPort(c.HTTP.Listen)
	if err != nil {
		return fmt.Errorf("http.listen must be host:port")
	}
	u, err := url.Parse(c.HTTP.PublicOrigin)
	if err != nil || u.Host == "" || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || u.User != nil {
		return fmt.Errorf("invalid publicOrigin")
	}
	if c.Mode == "production" && (u.Scheme != "https" || !c.HTTP.CookieSecure) {
		return fmt.Errorf("production requires HTTPS origin and secure cookies")
	}
	ip := net.ParseIP(host)
	if !c.HTTP.CookieSecure && (c.Mode != "development" || ip == nil || !ip.IsLoopback() || (u.Hostname() != "localhost" && u.Hostname() != "127.0.0.1" && u.Hostname() != "::1")) {
		return fmt.Errorf("insecure cookies require loopback development")
	}
	if len(c.HTTP.AllowedHosts) == 0 {
		return fmt.Errorf("allowedHosts is required")
	}
	originAllowed := false
	for _, h := range c.HTTP.AllowedHosts {
		if h == u.Host {
			originAllowed = true
		}
		if strings.ContainsAny(h, "/*\r\n ") {
			return fmt.Errorf("allowedHosts must be exact authorities")
		}
	}
	if !originAllowed {
		return fmt.Errorf("publicOrigin host must be allowed")
	}
	for _, proxy := range c.HTTP.TrustedProxies {
		if proxy == "0.0.0.0/0" || proxy == "::/0" {
			return fmt.Errorf("unrestricted trusted proxy is forbidden")
		}
		if net.ParseIP(proxy) == nil {
			if _, _, err := net.ParseCIDR(proxy); err != nil {
				return fmt.Errorf("invalid trusted proxy")
			}
		}
	}
	if withDatabase {
		db, err := url.Parse(c.DatabaseURL)
		if err != nil || (db.Scheme != "postgres" && db.Scheme != "postgresql") || db.Host == "" {
			return fmt.Errorf("valid PostgreSQL databaseUrl is required")
		}
	}
	dirs := []string{c.Paths.RuntimeRoot, c.Paths.StagingRoot, c.Paths.ArtifactCacheRoot, c.Paths.ExportRoot}
	for i, a := range dirs {
		if a == "" || a == filepath.VolumeName(a)+string(filepath.Separator) {
			return fmt.Errorf("unsafe data path")
		}
		for _, b := range dirs[i+1:] {
			if within(a, b) || within(b, a) {
				return fmt.Errorf("managed directories must not overlap")
			}
		}
	}
	for _, a := range c.Paths.AppRoots {
		for _, b := range dirs {
			if within(a, b) || within(b, a) {
				return fmt.Errorf("app and managed directories must not overlap")
			}
		}
	}
	if c.Helper.Enabled && (c.Helper.PanelUID < 0 || !filepath.IsAbs(c.Helper.SocketPath) || len(c.Helper.ServiceAccounts) == 0) {
		return fmt.Errorf("enabled helper requires panelUid, absolute socket and service accounts")
	}
	for _, account := range c.Helper.ServiceAccounts {
		if account == "root" || account == "" || strings.ContainsAny(account, "/:\n\r\x00 ") {
			return fmt.Errorf("invalid non-root service account")
		}
	}
	return nil
}

// within 使用路径组件判断目录包含关系。
// 真正访问文件时还必须使用 os.Root 防止符号链接逃逸。
func within(root, path string) bool {
	rel, err := filepath.Rel(root, path)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}
