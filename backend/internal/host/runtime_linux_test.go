//go:build linux

package host

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"os/user"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
	"zx-panel/internal/config"
)

// TestRuntimePackageOwner 验证精确包归属和语言允许列表，拒绝 diversion 与参数混入。
// 固定样例不查询包数据库或修改系统包。
func TestRuntimePackageOwner(t *testing.T) {
	for _, test := range []struct{ kind, path, output, want string }{
		{"go", "/usr/lib/go-1.25/bin/go", "golang-1.25-go: /usr/lib/go-1.25/bin/go\n", "golang-1.25-go"},
		{"node", "/usr/bin/node", "nodejs:amd64: /usr/bin/node\n", "nodejs:amd64"},
		{"python", "/usr/bin/python3.12", "python3.12-minimal: /usr/bin/python3.12\n", "python3.12-minimal"},
		{"java", "/usr/lib/jvm/bin/java", "openjdk-21-jre-headless:amd64: /usr/lib/jvm/bin/java\n", "openjdk-21-jre-headless:amd64"},
		{"node", "/usr/bin/node", "bash: /usr/bin/node\n", ""},
		{"node", "/usr/bin/node", "nodejs: /other/node\n", ""},
		{"node", "/usr/bin/node", "nodejs: /usr/bin/node\nbash: /usr/bin/node\n", ""},
		{"node", "/usr/bin/node", "diversion by nodejs: /usr/bin/node\n", ""},
		{"node", "/usr/bin/node", "nodejs:--force: /usr/bin/node\n", ""},
	} {
		got, err := runtimePackageOwner(test.kind, test.path, test.output)
		if got != test.want || (err != nil) != (test.want == "") {
			t.Fatalf("package owner %q: %q, %v", test.output, got, err)
		}
	}
}

// TestRuntimeJobSandbox 可选验证真实 systemd 作业参数及 Homebrew 所属账号降权。
// 仅执行 id，不运行生成的卸载命令；正常测试默认跳过，需明确启用且以 root 运行。
func TestRuntimeJobSandbox(t *testing.T) {
	if os.Getenv("ZX_PANEL_RUNTIME_JOB_TEST") != "1" {
		t.Skip("set ZX_PANEL_RUNTIME_JOB_TEST=1 for isolated systemd identity jobs")
	}
	if os.Geteuid() != 0 {
		t.Fatal("identity job check requires root")
	}
	account, err := user.Lookup("nobody")
	if err != nil {
		t.Fatal(err)
	}
	uid, err := strconv.Atoi(account.Uid)
	if err != nil {
		t.Fatal(err)
	}
	gid, err := strconv.Atoi(account.Gid)
	if err != nil {
		t.Fatal(err)
	}
	for _, target := range []RuntimeTarget{
		{Manager: "apt", Package: "nodejs"},
		{Manager: "homebrew", Package: "node", Root: "/home/linuxbrew/.linuxbrew/Cellar/node/22.0.0", OwnerUID: uid, OwnerGID: gid, Home: account.HomeDir},
	} {
		sum := sha256.Sum256([]byte(t.Name() + target.Manager + time.Now().String()))
		args, err := runtimeRemovalCommand(hex.EncodeToString(sum[:16]), &target)
		if err != nil {
			t.Fatal(err)
		}
		// 仅保留作业沙箱参数，将真实卸载命令替换为无副作用的身份检查。
		separator := slices.Index(args, "--")
		if separator < 0 {
			t.Fatal("job command boundary missing")
		}
		args = append(args[:separator+1], "/usr/bin/id", "--user")
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		out, err := fixedCommand(ctx, "/usr/bin/systemd-run", args...)
		cancel()
		if err != nil || strings.TrimSpace(string(out)) != strconv.Itoa(target.OwnerUID) {
			t.Fatalf("job identity %s: %q %v", target.Manager, out, err)
		}
	}
}

// TestHomebrewSandbox 可选验证组可写安装的降权执行和应用 home 只读映射。
// 只创建独立临时夹具并运行 id/test，不安装 Homebrew，不执行卸载或修改已有服务。
func TestHomebrewSandbox(t *testing.T) {
	if os.Getenv("ZX_PANEL_RUNTIME_JOB_TEST") != "1" {
		t.Skip("set ZX_PANEL_RUNTIME_JOB_TEST=1 for isolated Homebrew sandbox checks")
	}
	if os.Geteuid() != 0 {
		t.Fatal("sandbox check requires root")
	}
	account, err := user.Lookup("nobody")
	if err != nil {
		t.Fatal(err)
	}
	uid, err := strconv.Atoi(account.Uid)
	if err != nil {
		t.Fatal(err)
	}
	gid, err := strconv.Atoi(account.Gid)
	if err != nil {
		t.Fatal(err)
	}
	directory, err := os.MkdirTemp("/home", "zx-panel-runtime-test-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(directory) })
	if err = os.Chmod(directory, 0755); err != nil {
		t.Fatal(err)
	}
	prefix := filepath.Join(directory, "brew")
	if err = os.MkdirAll(filepath.Join(prefix, "bin"), 0755); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{prefix, filepath.Join(prefix, "bin")} {
		if err = os.Chown(path, uid, gid); err != nil {
			t.Fatal(err)
		}
		if err = os.Chmod(path, 0775); err != nil {
			t.Fatal(err)
		}
	}
	brew := filepath.Join(prefix, "bin/brew")
	if err = os.WriteFile(brew, []byte("#!/bin/sh\n/usr/bin/id --user\n"), 0755); err != nil {
		t.Fatal(err)
	}
	if err = os.Chown(brew, uid, gid); err != nil {
		t.Fatal(err)
	}
	hidden := filepath.Join(directory, "private")
	if err = os.WriteFile(hidden, []byte("hidden"), 0644); err != nil {
		t.Fatal(err)
	}
	target := &RuntimeTarget{Manager: "homebrew", Root: filepath.Join(prefix, "Cellar/node/22.0.0"), OwnerUID: uid, OwnerGID: gid, Home: account.HomeDir}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	output, err := brewRuntimeCommand(ctx, target, "list", "--versions")
	if err != nil || strings.TrimSpace(string(output)) != account.Uid {
		t.Fatalf("Homebrew did not run as its owner: %q %v", output, err)
	}
	protection, err := homebrewAppProtection(target)
	if err != nil {
		t.Fatal(err)
	}
	for index, assertion := range [][]string{{"-r", brew}, {"!", "-w", brew}, {"!", "-r", hidden}} {
		sum := sha256.Sum256([]byte(directory + strconv.Itoa(index)))
		args := []string{"--quiet", "--wait", "--pipe", "--collect", "--no-ask-password", "--unit=zx-panel-runtime-" + hex.EncodeToString(sum[:16]), "--uid=" + account.Uid, "--gid=" + account.Gid, "--property=Type=exec", "--property=RuntimeMaxSec=10", "--property=NoNewPrivileges=yes", "--property=ProtectSystem=strict", "--property=CapabilityBoundingSet="}
		for _, property := range strings.Split(strings.TrimSpace(protection), "\n") {
			args = append(args, "--property="+property)
		}
		args = append(args, "--", "/usr/bin/test")
		args = append(args, assertion...)
		if _, err = fixedCommand(ctx, "/usr/bin/systemd-run", args...); err != nil {
			t.Fatalf("home protection assertion %v: %v", assertion, err)
		}
	}
}

// TestRuntimeRemovalCommand 核对固定执行器、依赖保护及 Homebrew 降权参数。
// 测试只生成命令数组，绝不运行卸载命令或创建 systemd 作业。
func TestRuntimeRemovalCommand(t *testing.T) {
	id := strings.Repeat("a", 32)
	for _, test := range []struct {
		target RuntimeTarget
		tail   []string
	}{
		{RuntimeTarget{Manager: "apt", Package: "nodejs:amd64"}, []string{"--", "/usr/bin/dpkg", "--refuse-all", "--remove", "nodejs:amd64"}},
		{RuntimeTarget{Manager: "homebrew", Package: "node@22", Root: "/home/linuxbrew/.linuxbrew/Cellar/node@22/22.0.0", OwnerUID: 1000, OwnerGID: 1000, Home: "/home/linuxbrew"}, []string{"--", "/home/linuxbrew/.linuxbrew/bin/brew", "uninstall", "--formula", "node@22"}},
		{RuntimeTarget{Manager: "standalone", Root: "/usr/local/go"}, []string{"--", "/usr/bin/rm", "--recursive", "--one-file-system", "--", "/usr/local/go"}},
	} {
		args, err := runtimeRemovalCommand(id, &test.target)
		if err != nil || !slices.Equal(args[len(args)-len(test.tail):], test.tail) {
			t.Fatalf("command: %v %v", args, err)
		}
		for _, flag := range []string{"--wait", "--collect", "--expand-environment=no", "--property=RuntimeMaxSec=90"} {
			if !slices.Contains(args, flag) {
				t.Fatal("missing job boundary", flag)
			}
		}
		if test.target.Manager == "homebrew" && !slices.Contains(args, "--uid=1000") {
			t.Fatal("Homebrew would execute as root")
		}
		for _, arg := range args {
			if arg == "--force" || arg == "--ignore-dependencies" || arg == "autoremove" || arg == "--purge" {
				t.Fatal("unsafe removal flag", arg)
			}
		}
	}
	for _, target := range []RuntimeTarget{
		{Manager: "apt", Package: "--force-all"}, {Manager: "apt", Package: "nodejs;touch /tmp/x"},
		{Manager: "homebrew", Package: "node", Root: "/home/linuxbrew/.linuxbrew/Cellar/node/1", OwnerUID: 0},
		{Manager: "homebrew", Package: "other/tap/node", Root: "/home/u/.linuxbrew/Cellar/node/1", OwnerUID: 1000},
		{Manager: "standalone", Root: "/usr/local"}, {Manager: "standalone", Root: "/usr/local/go/.."},
	} {
		if _, err := runtimeRemovalCommand(id, &target); err == nil {
			t.Fatal("accepted unsafe removal target", target)
		}
	}
	if _, err := runtimeRemovalCommand("../../other", &RuntimeTarget{Manager: "apt", Package: "nodejs"}); err == nil {
		t.Fatal("accepted invalid job ID")
	}
}

// TestReplaceRuntimeLink 验证链接切换、重复切换和已有文件保护。
// 所有写入位于测试目录，系统入口完全不受影响。
func TestReplaceRuntimeLink(t *testing.T) {
	if err := setSystemRuntimeDefault(&RuntimeTarget{OwnerUID: 1000, Command: "go", Executable: "/home/user/.linuxbrew/bin/go"}); err == nil {
		t.Fatal("user-writable global runtime accepted")
	}
	directory := t.TempDir()
	root, err := os.OpenRoot(directory)
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	for _, target := range []string{"/opt/go-old/bin/go", "/opt/go-new/bin/go"} {
		if err := replaceRuntimeLink(root, "go", target); err != nil {
			t.Fatal(err)
		}
		if got, err := os.Readlink(filepath.Join(directory, "go")); err != nil || got != target {
			t.Fatal("link not switched", got, err)
		}
	}
	if err := os.WriteFile(filepath.Join(directory, "node"), []byte("keep"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := replaceRuntimeLink(root, "node", "/opt/node/bin/node"); err == nil {
		t.Fatal("overwrote existing file")
	}
	if body, err := os.ReadFile(filepath.Join(directory, "node")); err != nil || string(body) != "keep" {
		t.Fatal("existing file changed")
	}
	for _, command := range []string{"../escaped", "/absolute", "", ".", ".."} {
		if err := replaceRuntimeLink(root, command, "/opt/go/bin/go"); err == nil {
			t.Fatal("accepted unsafe entry", command)
		}
	}
	entries, err := os.ReadDir(directory)
	if err != nil || len(entries) != 2 {
		t.Fatal("temporary entry leaked", entries, err)
	}
}

// TestRuntimeTargetReadOnly 在支持 dpkg 的 Linux 上核实真实包元数据与陈旧指纹拒绝。
// 只读系统 Python，不卸载、切换默认或执行 Python 本身。
func TestRuntimeTargetReadOnly(t *testing.T) {
	path, err := filepath.EvalSymlinks("/usr/bin/python3")
	if err != nil {
		t.Skip("system Python unavailable")
	}
	if _, err := os.Stat("/usr/bin/dpkg-query"); err != nil {
		t.Skip("dpkg unavailable")
	}
	sum := sha256.Sum256([]byte("python:" + path))
	request := Request{Action: "runtime.target", Kind: "python", ID: hex.EncodeToString(sum[:16]), Executable: path}
	cfg := config.DefaultPanelConfig()
	cfg.Paths.RuntimeRoot = filepath.Join(t.TempDir(), "panel")
	target, err := inspectRuntimeTarget(context.Background(), cfg, request)
	if err != nil || target.Manager != "apt" || target.Package == "" || len(target.Fingerprint) != 64 {
		t.Fatalf("target: %#v %v", target, err)
	}
	request.Action, request.Fingerprint = "runtime.system-default", "outdated-fingerprint"
	if _, err := execute(context.Background(), cfg, request); err == nil {
		t.Fatal("stale target accepted")
	}
	request.ID = strings.Repeat("0", 32)
	if _, err := inspectRuntimeTarget(context.Background(), cfg, request); err == nil {
		t.Fatal("forged installation ID accepted")
	}
	if err := runtimeFileOwnership(path, 0, 0); err != nil {
		t.Fatal("protected executable rejected", err)
	}
	untrusted := filepath.Join(t.TempDir(), "go")
	if err := os.WriteFile(untrusted, []byte("#!/bin/sh\nexit 0\n"), 0777); err != nil {
		t.Fatal(err)
	}
	if err := runtimeFileOwnership(untrusted, os.Getuid(), os.Getgid()); err == nil {
		t.Fatal("unprotected runtime accepted")
	}
}

// TestRuntimeOwnershipProtection 覆盖 Homebrew 安装组可写与 root 安装的不同信任边界。
// 仅校验文件元数据，不更改主机账号、组或实际安装权限。
func TestRuntimeOwnershipProtection(t *testing.T) {
	for _, test := range []struct {
		mode         os.FileMode
		uid, gid     uint32
		owner, group int
		allowed      bool
	}{
		{0755, 0, 0, 0, 0, true},
		{0775, 0, 0, 0, 0, false},
		{os.ModeDir | 0775, 1000, 1000, 1000, 1000, true},
		{0775, 1000, 1001, 1000, 1000, false},
		{0777, 1000, 1000, 1000, 1000, false},
		{0755, 1001, 1000, 1000, 1000, false},
		{0775, 0, 1000, 1000, 1000, false},
		{os.ModeSetuid | 0755, 1000, 1000, 1000, 1000, false},
		{os.ModeSymlink | 0755, 1000, 1000, 1000, 1000, false},
	} {
		if got := runtimeOwnershipProtected(test.mode, &syscall.Stat_t{Uid: test.uid, Gid: test.gid}, test.owner, test.group); got != test.allowed {
			t.Fatalf("ownership %+v: allowed=%v", test, got)
		}
	}
}

// TestHomebrewAppProtection 保留 home 隔离，只映射已核实前缀供 Node 及其库读取。
// 非法列表语法和换行不能成为额外的 systemd 配置。
func TestHomebrewAppProtection(t *testing.T) {
	got, err := homebrewAppProtection(&RuntimeTarget{Root: "/home/linuxbrew/.linuxbrew/Cellar/node/22.0.0"})
	if err != nil || got != "ProtectHome=tmpfs\nBindReadOnlyPaths=\"/home/linuxbrew/.linuxbrew\"\n" {
		t.Fatalf("Homebrew protection: %q %v", got, err)
	}
	for _, root := range []string{"/home/user/.linuxbrew", "relative/Cellar/node/22", "/home/user:other/Cellar/node/22", "/home/user\nother/Cellar/node/22"} {
		if _, err := homebrewAppProtection(&RuntimeTarget{Root: root}); err == nil {
			t.Fatal("unsafe bind prefix accepted", root)
		}
	}
}

// TestStandaloneGoTargetReadOnly 核实标准目录中的 Go 不需要预先写入项目配置。
// 仅在已有安装时读取布局和指纹，不执行 Go 或变更默认入口。
func TestStandaloneGoTargetReadOnly(t *testing.T) {
	path := "/usr/local/go/bin/go"
	if _, err := os.Stat(path); err != nil {
		t.Skip("standalone Go unavailable")
	}
	sum := sha256.Sum256([]byte("go:" + path))
	cfg := config.DefaultPanelConfig()
	cfg.Paths.RuntimeRoot = filepath.Join(t.TempDir(), "panel")
	target, err := inspectRuntimeTarget(context.Background(), cfg, Request{Kind: "go", ID: hex.EncodeToString(sum[:16]), Executable: path})
	if err != nil || target.Manager != "standalone" || target.Root != "/usr/local/go" || target.Fingerprint == "" {
		t.Fatalf("Go target: %#v %v", target, err)
	}
}
