package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// 初始管理员密码边界与登录接口及 bcrypt 的输入限制保持一致。
// 下限避免不可用弱配置，上限避免 bcrypt 对超长输入返回运行时错误。
const (
	// minInitialPasswordBytes 是初始管理员密码允许的最小字节数。
	// 该值与登录接口的最小长度约束保持一致。
	minInitialPasswordBytes = 6
	// maxInitialPasswordBytes 是 bcrypt 能安全处理的最大密码字节数。
	// 登录请求同样限制为该上限，保证创建后一定可用于认证。
	maxInitialPasswordBytes = 72
)

// 认证领域错误用于在存储、服务和 API 层之间传递稳定分类。
// 每个哨兵错误都避免携带账号是否存在等敏感细节。
var (
	// ErrInvalidCredentials 表示账号或密码不正确，避免向调用方泄露账号是否存在。
	// API 层将该错误稳定映射为未授权响应。
	ErrInvalidCredentials = errors.New("invalid username or password")
	// ErrUnauthenticated 表示请求没有携带有效登录会话。
	// 认证中间件使用该错误触发全局重新登录流程。
	ErrUnauthenticated = errors.New("authentication required")
	// ErrUserNotFound 表示存储层没有找到指定用户。
	// 服务层会根据调用场景将其转换为更安全的领域错误。
	ErrUserNotFound = errors.New("user not found")
)

// User 是可安全返回给客户端的基础用户信息。
// 结构中刻意排除密码摘要和会话令牌等敏感字段。
type User struct {
	ID          int64     `json:"id"`
	Username    string    `json:"username"`
	DisplayName string    `json:"displayName"`
	Role        string    `json:"role"`
	Enabled     bool      `json:"enabled"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// UserCredential 包含认证服务校验密码所需的用户凭据。
// PasswordHash 只能在服务端内部流转，不得写入 API 响应。
type UserCredential struct {
	User
	PasswordHash string
}

// Store 定义认证服务所需的最小持久化能力。
// 接口使 PostgreSQL 实现和内存测试替身能够复用同一业务逻辑。
type Store interface {
	CountUsers(ctx context.Context) (int64, error)
	CreateUser(ctx context.Context, username string, displayName string, role string, passwordHash string) (User, error)
	FindUserByUsername(ctx context.Context, username string) (UserCredential, error)
	CreateSession(ctx context.Context, tokenHash []byte, userID int64, expiresAt time.Time) error
	FindUserBySession(ctx context.Context, tokenHash []byte, now time.Time) (User, error)
	DeleteSession(ctx context.Context, tokenHash []byte) error
}

// LoginResult 是登录成功后返回的会话与用户信息。
// 明文 Token 只在创建时返回一次，存储层仅保存其摘要。
type LoginResult struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expiresAt"`
	User      User      `json:"user"`
}

// Service 提供密码校验、会话创建、登录态解析和注销能力。
// 业务时间通过 now 函数封装，便于控制过期判断边界。
type Service struct {
	store      Store
	sessionTTL time.Duration
	now        func() time.Time
}

// NewService 创建认证服务并注入存储与会话有效期。
// 默认时钟使用本机时间，服务内部统一转换为 UTC。
func NewService(store Store, sessionTTL time.Duration) *Service {
	return &Service{
		store:      store,
		sessionTTL: sessionTTL,
		now:        time.Now,
	}
}

// EnsureInitialAdmin 在空用户表中创建初始管理员。
// 已有任意用户时不会创建账号或覆盖现有密码。
func (s *Service) EnsureInitialAdmin(ctx context.Context, username string, password string) error {
	count, err := s.store.CountUsers(ctx)
	if err != nil {
		return fmt.Errorf("count users: %w", err)
	}
	if count > 0 {
		return nil
	}
	if err := validateInitialPassword(password); err != nil {
		return err
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash initial administrator password: %w", err)
	}
	username = normalizeUsername(username)
	if username == "" {
		return errors.New("ADMIN_USERNAME must not be empty")
	}

	if _, err := s.store.CreateUser(ctx, username, "管理员", "admin", string(passwordHash)); err != nil {
		return fmt.Errorf("create initial administrator: %w", err)
	}
	return nil
}

// Login 校验账号密码并创建加密安全的随机会话令牌。
// 数据库只保存令牌摘要，账号不存在和密码错误返回相同错误。
func (s *Service) Login(ctx context.Context, username string, password string) (LoginResult, error) {
	credential, err := s.store.FindUserByUsername(ctx, normalizeUsername(username))
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			return LoginResult{}, ErrInvalidCredentials
		}
		return LoginResult{}, fmt.Errorf("find user: %w", err)
	}
	if !credential.Enabled || bcrypt.CompareHashAndPassword([]byte(credential.PasswordHash), []byte(password)) != nil {
		return LoginResult{}, ErrInvalidCredentials
	}

	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return LoginResult{}, fmt.Errorf("generate session token: %w", err)
	}
	token := base64.RawURLEncoding.EncodeToString(tokenBytes)
	tokenHash := sha256.Sum256([]byte(token))
	expiresAt := s.now().UTC().Add(s.sessionTTL)
	if err := s.store.CreateSession(ctx, tokenHash[:], credential.ID, expiresAt); err != nil {
		return LoginResult{}, fmt.Errorf("create session: %w", err)
	}

	return LoginResult{Token: token, ExpiresAt: expiresAt, User: credential.User}, nil
}

// Authenticate 根据会话令牌摘要查询当前用户。
// 空令牌、过期会话和禁用用户统一视为未认证。
func (s *Service) Authenticate(ctx context.Context, token string) (User, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return User{}, ErrUnauthenticated
	}
	tokenHash := sha256.Sum256([]byte(token))
	user, err := s.store.FindUserBySession(ctx, tokenHash[:], s.now().UTC())
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			return User{}, ErrUnauthenticated
		}
		return User{}, fmt.Errorf("find session: %w", err)
	}
	if !user.Enabled {
		return User{}, ErrUnauthenticated
	}
	return user, nil
}

// Logout 删除服务端会话，使令牌立即失效。
// 空令牌和不存在的会话保持幂等成功。
func (s *Service) Logout(ctx context.Context, token string) error {
	if strings.TrimSpace(token) == "" {
		return nil
	}
	tokenHash := sha256.Sum256([]byte(strings.TrimSpace(token)))
	if err := s.store.DeleteSession(ctx, tokenHash[:]); err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}

// normalizeUsername 统一账号两端空白和字母大小写。
// 规范化结果用于避免重复账号和大小写认证绕过。
func normalizeUsername(username string) string {
	return strings.ToLower(strings.TrimSpace(username))
}

// validateInitialPassword 校验初始管理员密码是否能被登录接口和 bcrypt 接受。
// 长度按 UTF-8 字节计算，确保不会超过 bcrypt 的七十二字节硬限制。
func validateInitialPassword(password string) error {
	passwordLength := len([]byte(password))
	if passwordLength < minInitialPasswordBytes {
		return fmt.Errorf("ADMIN_PASSWORD must contain at least %d bytes when creating the first administrator", minInitialPasswordBytes)
	}
	if passwordLength > maxInitialPasswordBytes {
		return fmt.Errorf("ADMIN_PASSWORD must contain at most %d bytes when creating the first administrator", maxInitialPasswordBytes)
	}
	return nil
}
