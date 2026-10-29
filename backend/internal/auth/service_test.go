package auth

import (
	"strings"
	"testing"
)

// TestValidateInitialPassword 验证初始管理员密码边界与认证能力一致。
// 用例覆盖过短、最小合法、最大合法和超过 bcrypt 上限四种情况。
func TestValidateInitialPassword(t *testing.T) {
	tests := []struct {
		name      string
		password  string
		wantError bool
	}{
		{name: "too short", password: "123", wantError: true},
		{name: "minimum", password: "123456", wantError: false},
		{name: "maximum", password: strings.Repeat("a", maxInitialPasswordBytes), wantError: false},
		{name: "too long", password: strings.Repeat("a", maxInitialPasswordBytes+1), wantError: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateInitialPassword(tt.password)
			if (err != nil) != tt.wantError {
				t.Fatalf("validateInitialPassword() error = %v, wantError %v", err, tt.wantError)
			}
		})
	}
}
