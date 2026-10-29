package api

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"zx-panel/internal/auth"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

// testAuthStore 是认证路由测试使用的内存存储。
// 它记录会话摘要并提供固定用户，避免测试依赖真实数据库。
type testAuthStore struct {
	credential auth.UserCredential
	sessions   map[string]time.Time
}

// CountUsers 返回测试存储中的固定用户数量。
// 路由测试已有预置用户，因此始终返回一。
func (s *testAuthStore) CountUsers(context.Context) (int64, error) {
	return 1, nil
}

// CreateUser 满足认证存储接口并返回预置用户。
// 路由测试不执行初始管理员创建流程，因此该方法仅用于接口完整性。
func (s *testAuthStore) CreateUser(context.Context, string, string, string, string) (auth.User, error) {
	return s.credential.User, nil
}

// FindUserByUsername 按测试账号返回预置凭据。
// 非预期账号统一映射为用户不存在错误。
func (s *testAuthStore) FindUserByUsername(_ context.Context, username string) (auth.UserCredential, error) {
	if username != s.credential.Username {
		return auth.UserCredential{}, auth.ErrUserNotFound
	}
	return s.credential, nil
}

// CreateSession 记录会话摘要和过期时间。
// 内存键使用十六进制编码，便于稳定比较字节摘要。
func (s *testAuthStore) CreateSession(_ context.Context, tokenHash []byte, _ int64, expiresAt time.Time) error {
	s.sessions[hex.EncodeToString(tokenHash)] = expiresAt
	return nil
}

// FindUserBySession 验证测试会话存在且未过期。
// 无效或过期摘要统一返回用户不存在错误供服务层转换。
func (s *testAuthStore) FindUserBySession(_ context.Context, tokenHash []byte, now time.Time) (auth.User, error) {
	expiresAt, ok := s.sessions[hex.EncodeToString(tokenHash)]
	if !ok || !expiresAt.After(now) {
		return auth.User{}, auth.ErrUserNotFound
	}
	return s.credential.User, nil
}

// DeleteSession 删除测试会话摘要。
// 不存在的会话保持幂等成功，与真实存储行为一致。
func (s *testAuthStore) DeleteSession(_ context.Context, tokenHash []byte) error {
	delete(s.sessions, hex.EncodeToString(tokenHash))
	return nil
}

// TestAuthLoginMeAndLogout 验证完整的认证接口链路。
// 用例覆盖登录、当前用户、退出以及退出后令牌立即失效。
func TestAuthLoginMeAndLogout(t *testing.T) {
	passwordHash, err := bcrypt.GenerateFromPassword([]byte("secret123"), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("hash test password: %v", err)
	}
	store := &testAuthStore{
		credential: auth.UserCredential{
			User: auth.User{
				ID:          1,
				Username:    "admin",
				DisplayName: "管理员",
				Role:        "admin",
				Enabled:     true,
			},
			PasswordHash: string(passwordHash),
		},
		sessions: make(map[string]time.Time),
	}

	gin.SetMode(gin.TestMode)
	router := NewRouterWithAuth(auth.NewService(store, time.Hour))
	loginBody := []byte(`{"username":"ADMIN","password":"secret123"}`)
	loginResponse := performJSONRequest(router, http.MethodPost, "/api/v1/auth/login", loginBody, "")
	if loginResponse.Code != http.StatusOK {
		t.Fatalf("login status = %d, want %d: %s", loginResponse.Code, http.StatusOK, loginResponse.Body.String())
	}

	var loginPayload struct {
		Data auth.LoginResult `json:"data"`
	}
	if err := json.Unmarshal(loginResponse.Body.Bytes(), &loginPayload); err != nil {
		t.Fatalf("decode login response: %v", err)
	}
	if loginPayload.Data.Token == "" {
		t.Fatal("expected non-empty login token")
	}

	meResponse := performJSONRequest(router, http.MethodGet, "/api/v1/auth/me", nil, loginPayload.Data.Token)
	if meResponse.Code != http.StatusOK {
		t.Fatalf("me status = %d, want %d: %s", meResponse.Code, http.StatusOK, meResponse.Body.String())
	}

	logoutResponse := performJSONRequest(router, http.MethodPost, "/api/v1/auth/logout", nil, loginPayload.Data.Token)
	if logoutResponse.Code != http.StatusOK {
		t.Fatalf("logout status = %d, want %d: %s", logoutResponse.Code, http.StatusOK, logoutResponse.Body.String())
	}

	expiredResponse := performJSONRequest(router, http.MethodGet, "/api/v1/auth/me", nil, loginPayload.Data.Token)
	if expiredResponse.Code != http.StatusUnauthorized {
		t.Fatalf("expired me status = %d, want %d: %s", expiredResponse.Code, http.StatusUnauthorized, expiredResponse.Body.String())
	}
}

// TestAuthLoginRejectsInvalidPassword 验证错误密码不会创建登录会话。
// 接口必须返回未授权状态且内存存储中不得出现会话摘要。
func TestAuthLoginRejectsInvalidPassword(t *testing.T) {
	passwordHash, err := bcrypt.GenerateFromPassword([]byte("secret123"), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("hash test password: %v", err)
	}
	store := &testAuthStore{
		credential: auth.UserCredential{
			User:         auth.User{ID: 1, Username: "admin", Enabled: true},
			PasswordHash: string(passwordHash),
		},
		sessions: make(map[string]time.Time),
	}

	gin.SetMode(gin.TestMode)
	router := NewRouterWithAuth(auth.NewService(store, time.Hour))
	response := performJSONRequest(router, http.MethodPost, "/api/v1/auth/login", []byte(`{"username":"admin","password":"wrong999"}`), "")
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d: %s", response.Code, http.StatusUnauthorized, response.Body.String())
	}
	if len(store.sessions) != 0 {
		t.Fatal("invalid password unexpectedly created a session")
	}
}

// performJSONRequest 执行 JSON 路由测试请求。
// token 非空时会按 Bearer 规范附加 Authorization 请求头。
func performJSONRequest(router http.Handler, method string, path string, body []byte, token string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, bytes.NewReader(body))
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	return recorder
}
