package api

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
	"zx-panel/internal/auth"
	"zx-panel/internal/config"
	"zx-panel/internal/control"
	"zx-panel/internal/security"
	"zx-panel/internal/storage"
)

// panelAPI 将 HTTP 身份边界与不依赖 Gin 的业务服务连接。
// 对外响应仅通过 answer 和 failure 统一封装。
type panelAPI struct {
	cfg        config.PanelConfig
	database   *storage.Postgres
	auth       *auth.Service
	service    *control.Service
	rateMu     sync.Mutex
	rates      map[string]rateWindow
	streamMu   sync.Mutex
	logStreams map[string]int
}

// rateWindow 为匿名入口记录一个有限的一分钟窗口。
// 不存储用户名或密码，最多保留四千零九十六个来源。
type rateWindow struct {
	Since time.Time
	Count int
}

// envelope 是 v1.1 唯一生产响应格式，保留 success/data/error 兼容性。
// 文件下载与 SSE 使用各自的标准传输格式。
type envelope struct {
	Success bool `json:"success"`
	Data    any  `json:"data"`
	Error   any  `json:"error"`
	Meta    struct {
		RequestID  string    `json:"requestId"`
		ServerTime time.Time `json:"serverTime"`
	} `json:"meta"`
}

// currentSession 在单次已授权请求内复用用户和 Cookie 摘要。
// 原始 Cookie 不写入日志或响应。
type currentSession struct {
	User    auth.User
	Hash    []byte
	Token   string
	Expires time.Time
}

// administratorName 与已有账号长度一致，初始化不允许控制字符。
// 用户名可规范化，密码始终保留原始字节。
var administratorName = regexp.MustCompile(`^[A-Za-z0-9_.-]{3,32}$`)

// NewPanelRouter 装配真实 Cookie API，不启用旧 Bearer 路由。
// 静态资源 handler 只作为非 API GET/HEAD 的最后回退。
func NewPanelRouter(cfg config.PanelConfig, db *storage.Postgres, service *control.Service, assets http.Handler) (*gin.Engine, error) {
	p := &panelAPI{cfg: cfg, database: db, auth: auth.NewService(db, 12*time.Hour), service: service, rates: map[string]rateWindow{}, logStreams: map[string]int{}}
	router := gin.New()
	if err := router.SetTrustedProxies(cfg.HTTP.TrustedProxies); err != nil {
		return nil, err
	}
	router.HandleMethodNotAllowed = true
	router.Use(p.boundary())
	router.GET("/healthz", func(c *gin.Context) {
		if service.Draining() {
			p.failure(c, control.Fail(503, "SERVICE_DRAINING", "服务正在排空"))
			return
		}
		p.answer(c, 200, gin.H{"status": "ok"})
	})
	v1 := router.Group("/api/v1")
	v1.GET("/auth/session", p.rateLimit(120), p.session)
	v1.GET("/setup/status", p.rateLimit(60), func(c *gin.Context) {
		count, err := db.CountUsers(c.Request.Context())
		if err != nil {
			p.failure(c, err)
			return
		}
		p.answer(c, 200, gin.H{"setupRequired": count == 0})
	})
	v1.POST("/auth/login", p.rateLimit(10), p.preloginCSRF(), p.login)
	v1.POST("/auth/setup", p.rateLimit(5), p.preloginCSRF(), p.setup)
	protected := v1.Group("")
	protected.Use(p.requireSession())
	protected.GET("/auth/me", func(c *gin.Context) { p.answer(c, 200, gin.H{"user": sessionFrom(c).User}) })
	protected.POST("/auth/logout", p.csrf(), p.logout)
	protected.POST("/auth/password", p.rateLimit(5), p.csrf(), p.password)
	admin := protected.Group("")
	admin.Use(func(c *gin.Context) {
		if sessionFrom(c).User.Role != "admin" {
			p.failure(c, control.Fail(403, "FORBIDDEN", "此操作需要管理员权限"))
			c.Abort()
			return
		}
		c.Next()
	})
	p.registerResources(admin)
	router.NoMethod(func(c *gin.Context) {
		allowed := []string{}
		for _, route := range router.Routes() {
			if routeMatches(route.Path, c.Request.URL.Path) {
				allowed = append(allowed, route.Method)
			}
		}
		if len(allowed) > 0 {
			c.Header("Allow", strings.Join(allowed, ", "))
		}
		p.failure(c, control.Fail(405, "METHOD_NOT_ALLOWED", "该资源不支持此方法"))
	})
	router.NoRoute(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api/") || c.Request.URL.Path == "/api" {
			p.failure(c, control.Fail(404, "RESOURCE_NOT_FOUND", "API 路径不存在"))
			return
		}
		if assets == nil {
			p.failure(c, control.Fail(404, "RESOURCE_NOT_FOUND", "前端资源未启用，请启动 Vite 开发服务器"))
			return
		}
		if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead {
			c.Header("Allow", "GET, HEAD")
			p.failure(c, control.Fail(405, "METHOD_NOT_ALLOWED", "页面仅支持读取"))
			return
		}
		assets.ServeHTTP(c.Writer, c.Request)
	})
	return router, nil
}

// answer 为每次成功响应添加请求与服务端时间元数据。
// 不把任务受理的 202 描述成已经执行成功。
func (p *panelAPI) answer(c *gin.Context, status int, data any) {
	response := envelope{Success: true, Data: data}
	response.Meta.RequestID = c.GetString("requestId")
	response.Meta.ServerTime = time.Now().UTC()
	c.JSON(status, response)
}

// failure 只公开稳定错误，不将 SQL、路径、凭据或内部 panic 返回浏览器。
// 内部失败使用固定诊断和请求 ID 关联。
func (p *panelAPI) failure(c *gin.Context, err error) {
	status, code, message := 500, "INTERNAL_ERROR", "服务暂时无法完成请求"
	var fault *control.Fault
	var input *security.JSONError
	if errors.As(err, &fault) {
		status, code, message = fault.Status, fault.Code, fault.Message
	} else if errors.As(err, &input) {
		status, code, message = input.Status, input.Code, input.Message
	} else {
		slog.Error("API request failed", "requestId", c.GetString("requestId"), "route", c.FullPath())
	}
	response := envelope{Error: gin.H{"code": code, "message": message}}
	response.Meta.RequestID = c.GetString("requestId")
	response.Meta.ServerTime = time.Now().UTC()
	c.JSON(status, response)
}

// boundary 固定中间件顺序：限额、请求标识、日志、恢复、安全头与 Host。
// 只记录路由模板，避免 URL 筛选或请求体中的秘密进入日志。
func (p *panelAPI) boundary() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, security.DefaultMaxBodyBytes)
		id, err := control.ID()
		if err != nil {
			c.AbortWithStatus(503)
			return
		}
		c.Set("requestId", id)
		c.Header("X-Request-ID", id)
		started := time.Now()
		defer func() {
			if recovered := recover(); recovered != nil {
				slog.Error("API panic recovered", "requestId", id)
				if !c.Writer.Written() {
					p.failure(c, errors.New("handler panic"))
				}
				c.Abort()
			}
			slog.Info("http", "requestId", id, "method", c.Request.Method, "route", c.FullPath(), "status", c.Writer.Status(), "durationMs", time.Since(started).Milliseconds())
		}()
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Referrer-Policy", "no-referrer")
		c.Header("X-Frame-Options", "DENY")
		c.Header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		c.Header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
		if p.cfg.Mode == "production" {
			c.Header("Strict-Transport-Security", "max-age=31536000")
		}
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.Header("Cache-Control", "no-store")
		}
		allowed := false
		for _, host := range p.cfg.HTTP.AllowedHosts {
			if strings.EqualFold(host, c.Request.Host) {
				allowed = true
				break
			}
		}
		if !allowed {
			p.failure(c, control.Fail(403, "HOST_NOT_ALLOWED", "请求 Host 不在允许列表"))
			c.Abort()
			return
		}
		origin := c.GetHeader("Origin")
		if origin != "" && origin != p.cfg.HTTP.PublicOrigin {
			p.failure(c, control.Fail(403, "ORIGIN_NOT_ALLOWED", "请求来源不受信任"))
			c.Abort()
			return
		}
		if c.GetHeader("Sec-Fetch-Site") == "cross-site" {
			p.failure(c, control.Fail(403, "ORIGIN_NOT_ALLOWED", "拒绝跨站请求"))
			c.Abort()
			return
		}
		if c.Request.Method != "GET" && c.Request.Method != "HEAD" && c.Request.Method != "OPTIONS" && origin != p.cfg.HTTP.PublicOrigin {
			p.failure(c, control.Fail(403, "ORIGIN_NOT_ALLOWED", "写请求必须携带允许的 Origin"))
			c.Abort()
			return
		}
		c.Next()
	}
}

// rateLimit 对已验证代理链解析出的客户端地址限流。
// map 达到上限时拒绝新来源，而不是无限分配内存。
func (p *panelAPI) rateLimit(max int) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := c.ClientIP() + ":" + c.FullPath()
		now := time.Now()
		p.rateMu.Lock()
		for id, window := range p.rates {
			if now.Sub(window.Since) > time.Minute {
				delete(p.rates, id)
			}
		}
		window, exists := p.rates[key]
		if !exists {
			window = rateWindow{Since: now}
		}
		allowed := window.Count < max && (exists || len(p.rates) < 4096)
		if allowed {
			window.Count++
			p.rates[key] = window
		}
		p.rateMu.Unlock()
		if !allowed {
			c.Header("Retry-After", "60")
			p.failure(c, control.Fail(429, "RATE_LIMITED", "请求过于频繁，请稍后重试"))
			c.Abort()
			return
		}
		c.Next()
	}
}

// cookieName 在 HTTPS 部署采用 __Host- 前缀限制 Domain 与 Path。
// 本地 HTTP 开发使用独立名字，不能降低生产 Cookie 策略。
func (p *panelAPI) cookieName(preauth bool) string {
	name := "zx-panel-session"
	if preauth {
		name = "zx-panel-preauth"
	}
	if p.cfg.HTTP.CookieSecure {
		name = "__Host-" + name
	}
	return name
}

// cookie 统一设置 HttpOnly、SameSite 与 Path，删除沿用同一属性。
// 认证 Cookie 不允许 JavaScript 读取。
func (p *panelAPI) cookie(c *gin.Context, preauth bool, value string, maxAge int) {
	http.SetCookie(c.Writer, &http.Cookie{Name: p.cookieName(preauth), Value: value, Path: "/", HttpOnly: true, Secure: p.cfg.HTTP.CookieSecure, SameSite: http.SameSiteStrictMode, MaxAge: maxAge})
}

// tokenHash 只对会话原始值做摘要，不做会改变秘密的通用裁剪。
// 长度在读取 Cookie 时单独限制。
func tokenHash(token string) []byte { sum := sha256.Sum256([]byte(token)); return sum[:] }

// randomToken 生成二百五十六位随机会话值。
// 随机源失败必须中断认证。
func randomToken() (string, error) {
	var bytes [32]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(bytes[:]), nil
}

// readSession 查询 Cookie 专用会话，并区分数据库故障和未认证。
// 被动 SSE 不更新空闲时间。
func (p *panelAPI) readSession(c *gin.Context, touch bool) (currentSession, error) {
	var session currentSession
	token, err := c.Cookie(p.cookieName(false))
	if err != nil || len(token) != 43 {
		return session, auth.ErrUnauthenticated
	}
	user, expires, err := p.database.CookieUser(c.Request.Context(), tokenHash(token), touch)
	if err != nil {
		return session, err
	}
	return currentSession{User: user, Token: token, Hash: tokenHash(token), Expires: expires}, nil
}

// sessionFrom 只在 requireSession 成功之后读取上下文身份。
// 中间件未装配属于程序错误，不从客户端字段恢复身份。
func sessionFrom(c *gin.Context) currentSession {
	value, ok := c.Get("session")
	if !ok {
		panic("session middleware missing")
	}
	session, ok := value.(currentSession)
	if !ok {
		panic("invalid session context")
	}
	return session
}

// session 返回匿名最小状态或当前用户，并提供会话绑定的 CSRF 值。
// 匿名响应不包含主机、日志、应用或运行时数据。
func (p *panelAPI) session(c *gin.Context) {
	session, err := p.readSession(c, false)
	if err == nil {
		p.answer(c, 200, gin.H{"authenticated": true, "user": session.User, "expiresAt": session.Expires, "csrfToken": p.service.Vault.Sign("csrf", session.Token)})
		return
	}
	if !errors.Is(err, auth.ErrUnauthenticated) {
		p.failure(c, err)
		return
	}
	token, _ := c.Cookie(p.cookieName(true))
	if len(token) != 43 || !p.database.ValidPreauth(c.Request.Context(), tokenHash(token)) {
		token, err = randomToken()
		if err != nil {
			p.failure(c, err)
			return
		}
		if err = p.database.SavePreauth(c.Request.Context(), tokenHash(token)); err != nil {
			p.failure(c, err)
			return
		}
		p.cookie(c, true, token, 600)
	}
	p.answer(c, 200, gin.H{"authenticated": false, "user": nil, "expiresAt": nil, "csrfToken": p.service.Vault.Sign("csrf", token)})
}

// preloginCSRF 对登录与初始化同样验证预登录会话和 CSRF。
// 已登录后重新认证可使用当前会话，成功后仍轮换令牌。
func (p *panelAPI) preloginCSRF() gin.HandlerFunc {
	return func(c *gin.Context) {
		session, err := p.readSession(c, false)
		token := session.Token
		if err != nil {
			if !errors.Is(err, auth.ErrUnauthenticated) {
				p.failure(c, err)
				c.Abort()
				return
			}
			token, _ = c.Cookie(p.cookieName(true))
			if len(token) != 43 || !p.database.ValidPreauth(c.Request.Context(), tokenHash(token)) {
				p.failure(c, control.Fail(403, "CSRF_INVALID", "请先刷新登录会话"))
				c.Abort()
				return
			}
		}
		if !p.service.Vault.Verify("csrf", token, c.GetHeader("X-CSRF-Token")) {
			p.failure(c, control.Fail(403, "CSRF_INVALID", "登录前 CSRF 校验失败"))
			c.Abort()
			return
		}
		c.Set("preauthToken", token)
		c.Next()
	}
}

// requireSession 是所有真实资源的统一身份入口，完全忽略 Authorization Bearer。
// 过期时返回 401，让前端清除缓存并关闭流。
func (p *panelAPI) requireSession() gin.HandlerFunc {
	return func(c *gin.Context) {
		passive := strings.HasSuffix(c.FullPath(), "/events") || strings.HasSuffix(c.FullPath(), "/stream")
		session, err := p.readSession(c, !passive)
		if err != nil {
			if errors.Is(err, auth.ErrUnauthenticated) {
				p.cookie(c, false, "", -1)
				p.failure(c, control.Fail(401, "UNAUTHENTICATED", "会话已失效，请重新登录"))
			} else {
				p.failure(c, err)
			}
			c.Abort()
			return
		}
		c.Set("session", session)
		c.Next()
	}
}

// csrf 为所有已认证写请求校验固定时间签名。
// Origin 和 Host 已在外层独立验证。
func (p *panelAPI) csrf() gin.HandlerFunc {
	return func(c *gin.Context) {
		session := sessionFrom(c)
		if !p.service.Vault.Verify("csrf", session.Token, c.GetHeader("X-CSRF-Token")) {
			p.failure(c, control.Fail(403, "CSRF_INVALID", "请求 CSRF 校验失败"))
			c.Abort()
			return
		}
		c.Next()
	}
}

// decode 使用统一严格 JSON 解码器，拒绝重复字段与大小写别名。
// 密码、参数及秘密值不被自动裁剪。
func (p *panelAPI) decode(c *gin.Context, target any) bool {
	if err := security.DecodeJSON(c.Writer, c.Request, target); err != nil {
		p.failure(c, err)
		return false
	}
	return true
}

// login 复用已有 bcrypt 摘要，成功后撤销旧 Cookie 并轮换会话。
// 无论账号不存在、禁用还是密码错误，均返回同一种公开错误。
func (p *panelAPI) login(c *gin.Context) {
	var input struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if !p.decode(c, &input) {
		return
	}
	if !administratorName.MatchString(input.Username) || len(input.Password) < 1 || len(input.Password) > 72 {
		p.failure(c, control.Fail(422, "INVALID_INPUT", "账号或密码格式无效"))
		return
	}
	result, err := p.auth.Login(c.Request.Context(), input.Username, input.Password)
	if err != nil {
		if errors.Is(err, auth.ErrInvalidCredentials) {
			_ = p.service.Repo.Audit(c.Request.Context(), 0, "auth.login", "", "", c.GetString("requestId"), "denied", "账号认证失败")
			p.failure(c, control.Fail(401, "INVALID_CREDENTIALS", "账号或密码错误"))
		} else {
			p.failure(c, err)
		}
		return
	}
	if err = p.database.MarkCookieSession(c.Request.Context(), tokenHash(result.Token)); err != nil {
		_ = p.auth.Logout(c.Request.Context(), result.Token)
		p.failure(c, err)
		return
	}
	old, _ := c.Cookie(p.cookieName(false))
	if old != "" {
		if err = p.auth.Logout(c.Request.Context(), old); err != nil {
			_ = p.auth.Logout(c.Request.Context(), result.Token)
			p.failure(c, err)
			return
		}
		p.service.Events.Revoke(result.User.ID)
	}
	if err = p.database.DeletePreauth(c.Request.Context(), tokenHash(c.GetString("preauthToken"))); err != nil {
		_ = p.auth.Logout(c.Request.Context(), result.Token)
		p.failure(c, err)
		return
	}
	p.cookie(c, true, "", -1)
	p.cookie(c, false, result.Token, 43200)
	_ = p.service.Repo.Audit(c.Request.Context(), result.User.ID, "auth.login", "", "", c.GetString("requestId"), "succeeded", "已轮换 Cookie 会话")
	p.answer(c, 200, gin.H{"user": result.User, "expiresAt": result.ExpiresAt, "csrfToken": p.service.Vault.Sign("csrf", result.Token)})
}

// validPassword 约束新密码的字符下限与 bcrypt 字节上限。
// 已有账号登录仍兼容旧摘要的原始密码。
func validPassword(password string) bool {
	return utf8.ValidString(password) && utf8.RuneCountInString(password) >= 12 && len(password) <= 72
}

// setup 只消费本机 CLI 的短期一次性凭据，不自动创建默认管理员。
// 凭据与账号创建在存储事务内互斥完成。
func (p *panelAPI) setup(c *gin.Context) {
	var input struct {
		Token    string `json:"token"`
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if !p.decode(c, &input) {
		return
	}
	if len(input.Token) != 43 || !administratorName.MatchString(input.Username) || !validPassword(input.Password) {
		p.failure(c, control.Fail(422, "INVALID_INPUT", "初始化凭据、账号或密码格式无效"))
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		p.failure(c, err)
		return
	}
	err = p.database.SetupAdmin(c.Request.Context(), tokenHash(input.Token), strings.ToLower(input.Username), string(hash))
	if err != nil {
		if errors.Is(err, auth.ErrInvalidCredentials) {
			p.failure(c, control.Fail(403, "SETUP_TOKEN_INVALID", "初始化凭据无效、过期或已被使用"))
		} else {
			p.failure(c, err)
		}
		return
	}
	if err = p.database.DeletePreauth(c.Request.Context(), tokenHash(c.GetString("preauthToken"))); err != nil {
		p.failure(c, err)
		return
	}
	p.cookie(c, true, "", -1)
	p.answer(c, 201, gin.H{"initialized": true})
}

// logout 先撤销服务器会话，再清 Cookie 与实时连接。
// 数据库失败不能返回已经退出的虚假成功。
func (p *panelAPI) logout(c *gin.Context) {
	var input struct{}
	if !p.decode(c, &input) {
		return
	}
	session := sessionFrom(c)
	if err := p.database.DeleteSession(c.Request.Context(), session.Hash); err != nil {
		p.failure(c, err)
		return
	}
	p.service.Events.Revoke(session.User.ID)
	p.cookie(c, false, "", -1)
	_ = p.service.Repo.Audit(c.Request.Context(), session.User.ID, "auth.logout", "", "", c.GetString("requestId"), "succeeded", "当前会话已撤销")
	p.answer(c, 200, gin.H{"loggedOut": true})
}

// password 再次验证当前密码，并原子改密及撤销所有会话。
// 返回后当前浏览器也需要重新登录。
func (p *panelAPI) password(c *gin.Context) {
	var input struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if !p.decode(c, &input) {
		return
	}
	if !validPassword(input.NewPassword) || len(input.CurrentPassword) > 72 {
		p.failure(c, control.Fail(422, "INVALID_INPUT", "新密码至少 12 个字符且最多 72 个 UTF-8 字节"))
		return
	}
	session := sessionFrom(c)
	credential, err := p.database.FindUserByUsername(c.Request.Context(), session.User.Username)
	if err != nil {
		p.failure(c, err)
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(credential.PasswordHash), []byte(input.CurrentPassword)) != nil {
		p.failure(c, control.Fail(403, "INVALID_CREDENTIALS", "当前密码不正确"))
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(input.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		p.failure(c, err)
		return
	}
	if err = p.database.ChangePasswordIfHash(c.Request.Context(), session.User.ID, credential.PasswordHash, string(hash)); err != nil {
		p.failure(c, err)
		return
	}
	p.service.Events.Revoke(session.User.ID)
	p.cookie(c, false, "", -1)
	p.answer(c, 200, gin.H{"changed": true})
}

// pageParams 验证通用列表分页，拒绝无法解析的游标与超大 limit。
// 返回的 offset 仅用于已授权资源查询。
func pageParams(c *gin.Context, max int) (int, int, error) {
	limit := 50
	if value := c.Query("limit"); value != "" {
		n, err := strconv.Atoi(value)
		if err != nil || n < 1 || n > max {
			return 0, 0, control.Fail(422, "INVALID_INPUT", "分页大小无效")
		}
		limit = n
	}
	offset, err := control.Offset(c.Query("cursor"))
	return limit, offset, err
}

// noBody 强制空对象动作也走严格解码，防止无关字段悄然生效。
// DELETE 风格副作用在本 API 中仍由计划操作表达。
func (p *panelAPI) noBody(c *gin.Context) bool { var value struct{}; return p.decode(c, &value) }

// streamFrame 通过写入截止时间和 flush 限制慢客户端。
// 失败立即交给调用方终止连接，不继续排队。
func streamFrame(c *gin.Context, id, name string, payload any) error {
	controller := http.NewResponseController(c.Writer)
	if err := controller.SetWriteDeadline(time.Now().Add(10 * time.Second)); err != nil {
		return err
	}
	if id != "" {
		if _, err := fmt.Fprintf(c.Writer, "id: %s\n", id); err != nil {
			return err
		}
	}
	if _, err := fmt.Fprintf(c.Writer, "event: %s\ndata: ", name); err != nil {
		return err
	}
	if err := jsonEncode(c.Writer, payload); err != nil {
		return err
	}
	if _, err := io.WriteString(c.Writer, "\n"); err != nil {
		return err
	}
	return controller.Flush()
}

// validStreamSession 每次推送前检查会话，空闲流不延长登录。
// 会话撤销或存储不可用均停止敏感数据输出。
func (p *panelAPI) validStreamSession(ctx context.Context, session currentSession) bool {
	user, _, err := p.database.CookieUser(ctx, session.Hash, false)
	return err == nil && user.Role == "admin" && user.ID == session.User.ID
}
