package control

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"testing"
	"time"
)

// TestExternalRuntimeVersions 核对各语言的固定版本格式与启动器拒绝边界。
// 这些字符串是测试样例，不代表当前官方发布版本。
func TestExternalRuntimeVersions(t *testing.T) {
	cases := []struct{ kind, output, want string }{
		{"node", "v22.20.0\n", "22.20.0"},
		{"go", "go version go1.25 linux/amd64\n", "1.25"},
		{"rust", "rustc 1.90.0 (abc 2025-09-14)\n", "1.90.0"},
		{"python", "Python 3.12.3\n", "3.12.3"},
		{"java", "openjdk version \"21.0.8\" 2025-07-15\nOpenJDK Runtime Environment", "21.0.8"},
		{"java", "java version \"1.8.0_461\"\n", "1.8.0_461"},
		{"php", "PHP 8.3.6 (cli) (built: test)\n", "8.3.6"},
		{"ruby", "ruby 3.2.3p157 (test) [x86_64-linux]\n", "3.2.3p157"},
		{"dotnet", "Microsoft.NETCore.App 8.0.15 [/dotnet/shared]\nMicrosoft.NETCore.App 9.0.4 [/dotnet/shared]\n", "9.0.4"},
		{"bun", "1.2.22\n", "1.2.22"},
		{"deno", "deno 2.5.0 (stable, release, x86_64-unknown-linux-gnu)\nv8 14.0\n", "2.5.0"},
		{"rust", "rustup 1.28.2 (test)\n", ""},
		{"node", "not a runtime 22.20.0\n", ""},
	}
	for _, test := range cases {
		for _, probe := range externalRuntimes {
			if probe.kind != test.kind {
				continue
			}
			matches := probe.version.FindAllStringSubmatch(test.output, -1)
			got := ""
			if len(matches) > 0 {
				got = matches[len(matches)-1][1]
			}
			if got != test.want {
				t.Fatalf("%s: version %q, want %q", test.kind, got, test.want)
			}
		}
	}
}

// TestExternalRuntimeRelocation 验证共用扫描在 PATH 缺失时发现安装，并在目录迁移后重新定位。
// 开发与正式模式使用同一入口；临时 HOME 隔离测试，不执行主机已有运行时。
func TestExternalRuntimeRelocation(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("external runtime commands require Linux")
	}
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("PATH", filepath.Join(home, "removed-toolchain", "bin"))
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	previous := ""
	for _, directory := range []string{".local/bin", "sdk/go1.27.3/bin", ".linuxbrew/bin", ".linuxbrew/opt/go/libexec/bin"} {
		bin := filepath.Join(home, directory)
		if err := os.MkdirAll(bin, 0700); err != nil {
			t.Fatal(err)
		}
		path := filepath.Join(bin, "go")
		if previous == "" {
			if err := os.WriteFile(path, []byte("#!/bin/sh\nprintf 'go version go1.27.3 linux/amd64\\n'\n"), 0700); err != nil {
				t.Fatal(err)
			}
		} else if err := os.Rename(previous, path); err != nil {
			t.Fatal(err)
		}
		previous = path
		paths := externalRuntimePaths()
		if !slices.Contains(paths, "/usr/local/go/bin") || !slices.Contains(paths, bin) {
			t.Fatal("standard or current-account Go directory missing", paths)
		}
		paths = slices.DeleteFunc(paths, func(path string) bool { return !pathWithin(home, path) })
		items, err := scanExternalRuntimes(ctx, filepath.Join(home, "panel"), paths)
		if err != nil || len(items) != 1 {
			t.Fatalf("discovery after moving to %s: %v, %v", path, items, err)
		}
		if item := items[0]; item.Path != path || item.Kind != "go" || item.Version != "1.27.3" || item.State != "ready" || item.Ownership != "external" {
			t.Fatal("moved Go installation was not rediscovered", item)
		}
	}
}

// TestExternalRuntimeDiscovery 使用临时命令验证去重、只读边界及探测失败。
// 不修改系统安装、不连接数据库，也不依赖主机已安装的工具链。
func TestExternalRuntimeDiscovery(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("external runtime commands require Linux")
	}
	directory := t.TempDir()
	panelRoot := filepath.Join(t.TempDir(), "runtimes")
	write := func(path, body string) {
		t.Helper()
		if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte("#!/bin/sh\n"+body), 0700); err != nil {
			t.Fatal(err)
		}
	}
	write(filepath.Join(directory, "node"), "printf 'v22.20.0\\n'\n")
	if err := os.Symlink("node", filepath.Join(directory, "nodejs")); err != nil {
		t.Fatal(err)
	}
	write(filepath.Join(directory, "go"), "printf 'go version go1.25.1 linux/amd64\\n'\n")
	write(filepath.Join(directory, "rustup"), "case \"$0\" in */rustc) printf 'rustc 1.90.0 (test)\\n';; *) exit 1;; esac\n")
	if err := os.Symlink("rustup", filepath.Join(directory, "rustc")); err != nil {
		t.Fatal(err)
	}
	write(filepath.Join(directory, "java"), "printf 'openjdk version \"21.0.8\"\\n' >&2\n")
	write(filepath.Join(directory, "php"), "printf 'PHP 8.3.6 (cli)\\n'; exit 1\n")
	write(filepath.Join(directory, "ruby"), "while :; do printf 'oversized output'; done\n")
	write(filepath.Join(directory, "bun"), "[ -z \"$DATABASE_URL\" ] && [ \"$GOTOOLCHAIN\" = local ] && [ \"$RUSTUP_AUTO_INSTALL\" = 0 ] || exit 1\nprintf '1.2.22\\n'\n")
	write(filepath.Join(panelRoot, "bin", "python3"), "printf 'Python 3.12.3\\n'\n")
	t.Setenv("DATABASE_URL", "must-not-reach-version-command")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	items, err := scanExternalRuntimes(ctx, panelRoot, []string{".", directory, directory, filepath.Join(panelRoot, "bin")})
	if err != nil || len(items) != 7 {
		t.Fatalf("discovery: %d installations, %v", len(items), err)
	}
	for _, item := range items {
		if item.Ownership != "external" || item.IsPanelDefault {
			t.Fatal("system installation gained panel ownership")
		}
		if item.Kind == "php" || item.Kind == "ruby" {
			if item.State != "unknown" || item.Version != "未知" {
				t.Fatal("failed command reported ready", item)
			}
		} else if item.State != "ready" {
			t.Fatal("valid version was not detected", item)
		}
		if item.Kind == "rust" && item.Path != filepath.Join(directory, "rustc") {
			t.Fatal("rustup dispatcher replaced rustc path", item)
		}
	}
	canceled, stop := context.WithCancel(ctx)
	stop()
	if partial, err := scanExternalRuntimes(canceled, panelRoot, []string{directory}); !errors.Is(err, context.Canceled) || partial != nil {
		t.Fatal("canceled scan returned a partial installation snapshot", partial, err)
	}
}
