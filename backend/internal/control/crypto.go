package control

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// Vault 使用独立部署密钥加密秘密，并为 CSRF 与游标提供域隔离签名。
// 密钥不写入数据库，备份恢复必须另外保管此文件。
type Vault struct {
	aead cipher.AEAD
	key  []byte
}

// OpenVault 读取严格长度密钥，只有开发模式允许首次生成。
// 已有数据库但密钥丢失时不能悄悄换新密钥。
func OpenVault(path string, create bool) (*Vault, error) {
	key, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) && create {
		if err = os.MkdirAll(filepath.Dir(path), 0700); err != nil {
			return nil, err
		}
		key = make([]byte, 32)
		if _, err = rand.Read(key); err != nil {
			return nil, err
		}
		file, e := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if e != nil {
			return nil, e
		}
		_, e = file.Write(key)
		closeErr := file.Close()
		if e != nil {
			return nil, e
		}
		if closeErr != nil {
			return nil, closeErr
		}
		err = nil
	}
	if err != nil {
		return nil, fmt.Errorf("read independent secret key: %w", err)
	}
	info, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0077 != 0 && filepath.Separator != '\\' {
		return nil, errors.New("secret key must be a regular 0600 file")
	}
	if len(key) != 32 {
		return nil, errors.New("secret key must contain exactly 32 random bytes")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Vault{aead: aead, key: key}, nil
}

// Seal 将用途和资源标识绑定到密文，防止跨记录置换。
// 每次加密使用新的随机 nonce。
func (v *Vault) Seal(scope string, plain []byte) ([]byte, error) {
	nonce := make([]byte, v.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	return v.aead.Seal(nonce, nonce, plain, []byte(scope)), nil
}

// Open 校验认证标签与用途后才返回秘密。
// 密钥、上下文或数据不匹配时不返回部分明文。
func (v *Vault) Open(scope string, sealed []byte) ([]byte, error) {
	size := v.aead.NonceSize()
	if len(sealed) < size {
		return nil, errors.New("invalid encrypted input")
	}
	return v.aead.Open(nil, sealed[:size], sealed[size:], []byte(scope))
}

// Sign 对不同用途使用不同消息前缀，输出 URL 安全的固定签名。
// 调用方通过 hmac.Equal 而不是普通字符串比较验证。
func (v *Vault) Sign(scope, value string) string {
	mac := hmac.New(sha256.New, v.key)
	mac.Write([]byte(scope))
	mac.Write([]byte{0})
	mac.Write([]byte(value))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// Verify 进行固定时间签名比较。
// 该签名不能替代当前会话与资源权限检查。
func (v *Vault) Verify(scope, value, signature string) bool {
	return hmac.Equal([]byte(v.Sign(scope, value)), []byte(signature))
}
