//go:build linux

package host

import (
	"strings"
	"testing"
	"zx-panel/internal/config"
)

// TestUnitAndRuntimeBoundaries 覆盖不经过 shell 的引用、unit 名称与受控安装路径。
// 测试不需要 root，也不调用 systemd 或执行应用。
func TestUnitAndRuntimeBoundaries(t *testing.T) {
	for _, value := range []string{"line\ninject", "zero\x00byte", "return\rinject"} {
		if _, err := quoteUnit(value); err == nil {
			t.Fatal("control character accepted")
		}
	}
	quoted, err := quoteUnit(`a "$HOME" %n`)
	if err != nil || !strings.Contains(quoted, "%%n") || strings.Contains(quoted, "$$HOME") {
		t.Fatal("setting escaping mismatch", quoted, err)
	}
	cfg := config.DefaultPanelConfig()
	cfg.Paths.RuntimeRoot = "/opt/zx-panel/runtimes"
	for _, id := range []string{"../sshd", "sshd.service", "/tmp/runtime", strings.Repeat("a", 33)} {
		if _, err := runtimePath(cfg, "node", id); err == nil {
			t.Fatal("invalid runtime identity accepted")
		}
		if _, err := unitPath(id); err == nil {
			t.Fatal("invalid unit identity accepted")
		}
	}
	if _, err := runtimePath(cfg, "python", strings.Repeat("a", 32)); err == nil {
		t.Fatal("unsupported runtime accepted")
	}
}

// TestJournalCursorArguments 锁定真实 journalctl 的起点互斥约束。
// 历史和实时续传保留时间上界，下界由读取循环核对。
func TestJournalCursorArguments(t *testing.T) {
	for _, direction := range []string{"initial", "history", "tail"} {
		request := Request{ID: strings.Repeat("a", 32), Limit: 500, From: "2026-09-29T00:00:00Z", To: "2026-09-29T01:00:00Z"}
		if direction == "history" {
			request.Before = "s=anchor"
		} else if direction == "tail" {
			request.After = "s=anchor"
		}
		args, err := journalArgs(request)
		if err != nil {
			t.Fatal(err)
		}
		joined := strings.Join(args, " ")
		if strings.Contains(joined, "--since=") != (direction == "initial") || strings.Contains(joined, "--cursor=") != (direction != "initial") || !strings.Contains(joined, "--until=") {
			t.Fatal("journal start/end bounds changed", joined)
		}
		if strings.Contains(joined, "--reverse") != (direction != "tail") {
			t.Fatal("journal direction changed", joined)
		}
	}
	if _, err := journalArgs(Request{Limit: 1, Before: "a", After: "b"}); err == nil {
		t.Fatal("conflicting cursor accepted")
	}
}
