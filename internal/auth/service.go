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

var (
	// ErrInvalidCredentials 表示账号或密码不正确，避免向调用方泄露账号是否存在。
	ErrInvalidCredentials = errors.New("invalid username or password")
	// ErrUnauthenticated 表示请求没有携带有效登录会话。
	ErrUnauthenticated = errors.New("authentication required")
	// ErrUserNotFound 表示存储层没有找到指定用户。
	ErrUserNotFound = errors.New("user not found")
)

// User 是可安全返回给客户端的基础用户信息。
type User struct {
	ID          int64     `json:"id"`
	Username    string    `json:"username"`
	DisplayName string    `json:"displayName"`
	Role        string    `json:"role"`
	Enabled     bool      `json:"enabled"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// UserCredential 包含仅供认证服务内部校验的密码摘要。
type UserCredential struct {
	User
	PasswordHash string
}

// Store 定义认证服务所需的最小持久化能力，便于数据库实现与单元测试解耦。
type Store interface {
	CountUsers(ctx context.Context) (int64, error)
	CreateUser(ctx context.Context, username string, displayName string, role string, passwordHash string) (User, error)
	FindUserByUsername(ctx context.Context, username string) (UserCredential, error)
	CreateSession(ctx context.Context, tokenHash []byte, userID int64, expiresAt time.Time) error
	FindUserBySession(ctx context.Context, tokenHash []byte, now time.Time) (User, error)
	DeleteSession(ctx context.Context, tokenHash []byte) error
}

// LoginResult 是登录成功后返回的会话与用户信息。
type LoginResult struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expiresAt"`
	User      User      `json:"user"`
}

// Service 提供密码校验、会话创建、登录态解析和注销能力。
type Service struct {
	store      Store
	sessionTTL time.Duration
	now        func() time.Time
}

// NewService 创建认证服务。
func NewService(store Store, sessionTTL time.Duration) *Service {
	return &Service{
		store:      store,
		sessionTTL: sessionTTL,
		now:        time.Now,
	}
}

// EnsureInitialAdmin 在空用户表中创建初始管理员；已有用户时不会覆盖密码。
func (s *Service) EnsureInitialAdmin(ctx context.Context, username string, password string) error {
	count, err := s.store.CountUsers(ctx)
	if err != nil {
		return fmt.Errorf("count users: %w", err)
	}
	if count > 0 {
		return nil
	}
	if strings.TrimSpace(password) == "" {
		return errors.New("ADMIN_PASSWORD is required when creating the first administrator")
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

// Login 校验账号密码并创建一个只在当前会话有效的随机令牌。
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

// Authenticate 根据会话令牌查询当前用户。
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

// normalizeUsername 统一账号大小写，避免重复账号和大小写绕过。
func normalizeUsername(username string) string {
	return strings.ToLower(strings.TrimSpace(username))
}
