package control

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
	"zx-panel/internal/config"
)

// TestOfficialRequestCancellation 保留取消与截止语义，不能把用户取消改成来源故障。
// 预先取消的上下文不会发出网络请求。
func TestOfficialRequestCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := officialGet(ctx, "https://nodejs.org/dist/index.json"); !errors.Is(err, context.Canceled) {
		t.Fatalf("request cancellation lost: %v", err)
	}
}

// TestWorkingDirectoryScalarBoundary 在持久受理前拒绝无法安全表示的 systemd 标量。
// 普通内部空格、百分号与参数前后空白仍保持原值。
func TestWorkingDirectoryScalarBoundary(t *testing.T) {
	directory := filepath.Join(t.TempDir(), "node demo %n")
	app := AppDraft{Name: "test-app", WorkingDirectory: directory, RunAsUser: "zx-app", RestartPolicy: "no", Execution: Execution{Kind: "binary", ExecutablePath: filepath.Join(directory, "server"), Args: []string{"  literal $HOME %n  "}}}
	if err := validateDraft(app); err != nil {
		t.Fatal(err)
	}
	for _, suffix := range []string{" ", "\t", "\\"} {
		app.WorkingDirectory = directory + suffix
		if err := validateDraft(app); err == nil {
			t.Fatal("ambiguous systemd working directory accepted")
		}
	}
}

// TestArtifactCacheIntegrity 验证离线缓存命中、重验摘要及损坏缓存清除。
// 测试只操作临时目录，不连接官方来源或执行下载内容。
func TestArtifactCacheIntegrity(t *testing.T) {
	directory := t.TempDir()
	body := []byte("verified archive bytes")
	sum := sha256.Sum256(body)
	digest := hex.EncodeToString(sum[:])
	source := filepath.Join(t.TempDir(), "source")
	if err := os.WriteFile(source, body, 0600); err != nil {
		t.Fatal(err)
	}
	s := &Service{Config: config.PanelConfig{Paths: config.Paths{ArtifactCacheRoot: directory}}}
	if err := s.cacheArtifact(context.Background(), source, digest); err != nil {
		t.Fatal(err)
	}
	target, err := os.CreateTemp(t.TempDir(), "stage")
	if err != nil {
		t.Fatal(err)
	}
	defer target.Close()
	if copied, err := s.copyCachedArtifact(context.Background(), target, Artifact{SHA256: digest}); !copied || err != nil {
		t.Fatal(copied, err)
	}
	if err = os.WriteFile(filepath.Join(directory, artifactName(digest)), []byte("corrupt"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err = s.copyCachedArtifact(context.Background(), target, Artifact{SHA256: digest}); err == nil || s.artifactCached(digest) {
		t.Fatal("corrupt cache accepted or retained")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err = copyVerified(ctx, &bytes.Buffer{}, bytes.NewReader(body), digest); err == nil {
		t.Fatal("canceled copy accepted")
	}
}

// TestOperationDiscriminators 保证另一种动作或执行方式的字段不能被零值掩盖。
// 密码式空白和环境值不经过通用修剪。
func TestOperationDiscriminators(t *testing.T) {
	valid := `{"action":"runtime.install","releaseId":"node:22.1.0:linux-x64","makeDefault":false}`
	op, err := DecodeOperation([]byte(valid))
	if err != nil || op.MakeDefault == nil || *op.MakeDefault {
		t.Fatal(op, err)
	}
	for _, body := range []string{`{"action":"runtime.install","releaseId":"node:1.0.0:linux-x64","makeDefault":false,"appId":"x"}`, `{"action":"runtime.set-default","installationId":"id","expectedRevision":"1","makeDefault":null}`, `{"action":"runtime.install","releaseId":"x","makeDefault":false,"MakeDefault":true}`, `{"action":"runtime.install","releaseId":"x","makeDefault":false,"makeDefault":true}`} {
		if _, err := DecodeOperation([]byte(body)); err == nil {
			t.Fatalf("accepted invalid union: %s", body)
		}
	}
}

// TestVaultAndCursorBinding 验证加密用途、主体及筛选绑定，阻止密文和游标跨资源复制。
// 测试密钥只保存在临时目录。
func TestVaultAndCursorBinding(t *testing.T) {
	vault, err := OpenVault(filepath.Join(t.TempDir(), "key"), true)
	if err != nil {
		t.Fatal(err)
	}
	sealed, err := vault.Seal("plan:one", []byte("  secret  "))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = vault.Open("task:one", sealed); err == nil {
		t.Fatal("ciphertext replay across scopes")
	}
	plain, err := vault.Open("plan:one", sealed)
	if err != nil || string(plain) != "  secret  " {
		t.Fatal("plaintext changed")
	}
	service := &Service{Vault: vault}
	filter := LogFilter{SourceID: "panel", Level: "all", From: time.Now().Add(-time.Hour).UTC().Format(time.RFC3339Nano)}
	cursor := service.encodeLogCursor(1, filter, "20", "tail")
	if position, err := service.decodeLogCursor(1, filter, cursor, "tail"); err != nil || position != "20" {
		t.Fatal(err)
	}
	if _, err := service.decodeLogCursor(2, filter, cursor, "tail"); err == nil {
		t.Fatal("cross-actor cursor accepted")
	}
	if _, err := service.decodeLogCursor(1, filter, cursor, "history"); err == nil {
		t.Fatal("mixed cursor direction")
	}
	filter.Search = "changed"
	if _, err := service.decodeLogCursor(1, filter, cursor, "tail"); err == nil {
		t.Fatal("filter mutation accepted")
	}
}

// TestRedactionBeforeTruncation 确保长秘密不会因先截断而留下可见前缀。
// 同时锁定有效 UTF-8 与明确截断语义。
func TestRedactionBeforeTruncation(t *testing.T) {
	secret := strings.Repeat("s", 20000)
	message, truncated := redactLog("value="+secret, []string{secret})
	if message != "value=[REDACTED]" || truncated {
		t.Fatal("secret redaction happened too late")
	}
	_, truncated = redactLog(strings.Repeat("中", 20000), nil)
	if !truncated {
		t.Fatal("long log not marked truncated")
	}
}

// TestTrustedDownloadSources 锁定 HTTPS 主机及路径，不接受凭据、非标端口或本机地址。
// 重定向也经过同一个校验函数。
func TestTrustedDownloadSources(t *testing.T) {
	for _, address := range []string{"http://nodejs.org/dist/file", "https://nodejs.org.evil.invalid/dist/file", "https://user:pass@go.dev/dl/file", "https://127.0.0.1/go/file", "https://nodejs.org:8443/dist/file", "https://nodejs.org/other/file"} {
		u, err := url.Parse(address)
		if err != nil {
			t.Fatal(err)
		}
		if trustedURL(u) {
			t.Fatalf("accepted %s", address)
		}
	}
	for _, address := range []string{"https://nodejs.org/dist/v22.1.0/SHASUMS256.txt", "https://go.dev/dl/?mode=json&include=all", "https://dl.google.com/go/go1.25.1.linux-amd64.tar.gz"} {
		u, _ := url.Parse(address)
		if !trustedURL(u) {
			t.Fatal(address)
		}
	}
}

// TestHistoryGapsAndActorEvents 验证断流缺口和主体事件隔离。
// 不为缺少数据的时间段制造曲线，也不将另一个操作人的任务推送给当前用户。
func TestHistoryGapsAndActorEvents(t *testing.T) {
	start := time.Unix(1000, 0).UTC()
	a, b := 1.0, 3.0
	history := historyGaps(History{StepSeconds: 10, Points: []HistoryPoint{{At: start, Avg: &a, Min: &a, Max: &a, SampleCount: 1}, {At: start.Add(20 * time.Second), Avg: &b, Min: &b, Max: &b, SampleCount: 1}}}, start, start.Add(30*time.Second))
	if len(history.Points) != 3 || history.Points[1].Avg != nil || history.Points[1].SampleCount != 0 {
		t.Fatal(history)
	}
	hub, _ := NewEventHub()
	cursor, _ := hub.Cursor()
	_ = hub.PublishForActor("task.updated", map[string]int{"revision": 1}, 1)
	sub, events, reset, err := hub.Subscribe(cursor, 2)
	if err != nil || reset || len(events) != 0 {
		t.Fatal("cross-actor replay")
	}
	defer sub.Close()
	_ = hub.PublishForActor("task.updated", 1, 1)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	if _, ok := sub.Next(ctx); ok {
		t.Fatal("cross-actor live event")
	}
}
