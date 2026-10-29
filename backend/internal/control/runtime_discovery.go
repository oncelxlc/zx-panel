package control

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
)

// externalRuntime 定义只读探测命令及其版本格式。
// 这些类别不代表 helper 已开放安装或修改能力。
type externalRuntime struct {
	kind     string
	commands []string
	args     []string
	version  *regexp.Regexp
}

// externalRuntimes 仅执行固定版本命令，不从请求接受命令或参数。
// 版本格式分别校验，避免把 rustup 等启动器的版本误认为语言版本。
var externalRuntimes = []externalRuntime{
	{"node", []string{"node", "nodejs"}, []string{"--version"}, regexp.MustCompile(`^v?([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)\s*$`)},
	{"go", []string{"go"}, []string{"version"}, regexp.MustCompile(`^go version go([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:[a-z]+[0-9]+)?)\s`)},
	{"rust", []string{"rustc"}, []string{"--version"}, regexp.MustCompile(`^rustc ([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)\s`)},
	{"python", []string{"python3", "python"}, []string{"--version"}, regexp.MustCompile(`^Python ([0-9]+\.[0-9]+\.[0-9]+[0-9A-Za-z.-]*)\s*$`)},
	{"java", []string{"java"}, []string{"-version"}, regexp.MustCompile(`^(?:openjdk|java) (?:version )?"?([0-9]+(?:[._][0-9]+)*(?:[+-][0-9A-Za-z.-]+)?)`)},
	{"php", []string{"php"}, []string{"--version"}, regexp.MustCompile(`^PHP ([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)\s`)},
	{"ruby", []string{"ruby"}, []string{"--version"}, regexp.MustCompile(`^ruby ([0-9]+\.[0-9]+\.[0-9]+(?:[p-][0-9A-Za-z.-]+)?)\s`)},
	{"dotnet", []string{"dotnet"}, []string{"--list-runtimes"}, regexp.MustCompile(`(?m)^Microsoft\.NETCore\.App ([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)\s`)},
	{"bun", []string{"bun"}, []string{"--version"}, regexp.MustCompile(`^([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)\s*$`)},
	{"deno", []string{"deno"}, []string{"--version"}, regexp.MustCompile(`^deno ([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)\s`)},
}

// IsRuntimeKind 允许查询已支持探测的运行时类别。
// 安装目录与写操作仍独立限制为 Node.js 和 Go。
func IsRuntimeKind(kind string) bool {
	for _, probe := range externalRuntimes {
		if probe.kind == kind {
			return true
		}
	}
	return false
}

// externalRuntimePaths 合并服务 PATH、常见系统位置和当前账号的工具链目录。
// 不加载 shell 配置、不遍历其他账号目录，也不接受相对 PATH 项。
func externalRuntimePaths() []string {
	paths := filepath.SplitList(os.Getenv("PATH"))
	paths = append(paths, "/usr/local/bin", "/usr/bin", "/bin", "/snap/bin", "/usr/local/go/bin", "/opt/go/bin", "/home/linuxbrew/.linuxbrew/bin", "/usr/share/dotnet", "/usr/local/share/dotnet", "/opt/dotnet")
	patterns := []string{"/usr/lib/go*/bin", "/usr/lib/jvm/*/bin"}
	if home, err := os.UserHomeDir(); err == nil && filepath.IsAbs(home) {
		for _, directory := range []string{".local/bin", ".cargo/bin", ".bun/bin", ".deno/bin", ".dotnet", ".asdf/shims", ".local/share/mise/shims"} {
			paths = append(paths, filepath.Join(home, directory))
		}
		patterns = append(patterns, filepath.Join(home, ".nvm/versions/node/*/bin"), filepath.Join(home, ".rustup/toolchains/*/bin"))
	}
	for variable, directory := range map[string]string{"NVM_DIR": "versions/node/*/bin", "CARGO_HOME": "bin", "RUSTUP_HOME": "toolchains/*/bin"} {
		if root := os.Getenv(variable); filepath.IsAbs(root) {
			patterns = append(patterns, filepath.Join(root, directory))
		}
	}
	for _, pattern := range patterns {
		matches, _ := filepath.Glob(pattern)
		paths = append(paths, matches...)
	}
	return paths
}

// scanExternalRuntimes 对可访问安装读取版本，并按真实文件去重。
// 扫描取消时丢弃本轮结果，不能把尚未扫描的安装标为消失。
func scanExternalRuntimes(ctx context.Context, runtimeRoot string, paths []string) ([]Installation, error) {
	items := []Installation{}
	if runtime.GOOS != "linux" {
		return items, nil
	}
	seen := map[string]bool{}
	for _, probe := range externalRuntimes {
		for _, directory := range paths {
			if !filepath.IsAbs(directory) {
				continue
			}
			for _, name := range probe.commands {
				if err := ctx.Err(); err != nil {
					return nil, err
				}
				candidate := filepath.Join(directory, name)
				path, err := filepath.EvalSymlinks(candidate)
				if err != nil || pathWithin(runtimeRoot, path) || seen[probe.kind+":"+path] {
					continue
				}
				info, err := os.Stat(path)
				if err != nil || !info.Mode().IsRegular() || info.Mode().Perm()&0111 == 0 {
					continue
				}
				seen[probe.kind+":"+path] = true
				version := readExternalVersion(ctx, probe, candidate)
				if err := ctx.Err(); err != nil {
					return nil, err
				}
				state := "ready"
				if version == "" {
					version, state = "未知", "unknown"
				}
				// rustup 根据调用文件名选择工具；保留 rustc 启动入口供展示与引用检查。
				if probe.kind == "rust" && filepath.Base(path) == "rustup" {
					path = candidate
				}
				sum := sha256.Sum256([]byte(probe.kind + ":" + path))
				items = append(items, Installation{ID: hex.EncodeToString(sum[:16]), Kind: probe.kind, Version: version, Architecture: runtime.GOARCH, Path: path, Ownership: "external", State: state, Revision: "1"})
			}
		}
	}
	return items, ctx.Err()
}

// readExternalVersion 以主服务身份执行有超时和输出上限的固定版本命令。
// 环境不继承数据库凭据，禁止 Go/Rust 自动下载，Java 的 stderr 也参与解析。
func readExternalVersion(ctx context.Context, probe externalRuntime, path string) string {
	bounded, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	command := exec.CommandContext(bounded, path, probe.args...)
	home, err := os.UserHomeDir()
	if err != nil {
		home = "/nonexistent"
	}
	command.Dir = "/"
	command.Env = []string{"PATH=" + os.Getenv("PATH"), "HOME=" + home, "GOTOOLCHAIN=local", "RUSTUP_AUTO_INSTALL=0", "DOTNET_CLI_TELEMETRY_OPTOUT=1", "LANG=C", "LC_ALL=C"}
	for _, variable := range []string{"CARGO_HOME", "RUSTUP_HOME"} {
		if value := os.Getenv(variable); filepath.IsAbs(value) {
			command.Env = append(command.Env, variable+"="+value)
		}
	}
	output := &versionOutput{}
	command.Stdout, command.Stderr = output, output
	command.WaitDelay = time.Second
	if err := command.Run(); err != nil {
		return ""
	}
	versions := probe.version.FindAllStringSubmatch(strings.TrimSpace(output.String()), -1)
	if len(versions) == 0 {
		return ""
	}
	return versions[len(versions)-1][1]
}
