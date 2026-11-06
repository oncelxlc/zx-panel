//go:build linux

package host

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"
	"zx-panel/internal/config"
)

// runtimePackagePatterns 限定运行时对应的系统包，拒绝把任意包名交给特权执行器。
// 包名还必须由本机包数据库核实其拥有目标可执行文件。
var runtimePackagePatterns = map[string]*regexp.Regexp{
	"node":   regexp.MustCompile(`^nodejs$`),
	"go":     regexp.MustCompile(`^golang-[0-9]+\.[0-9]+-go$`),
	"rust":   regexp.MustCompile(`^rustc$`),
	"python": regexp.MustCompile(`^python[23](\.[0-9]+)?(-minimal)?$`),
	"java":   regexp.MustCompile(`^openjdk-[0-9]+-(jre|jdk)(-headless)?$`),
	"php":    regexp.MustCompile(`^php[0-9]+\.[0-9]+-cli$`),
	"ruby":   regexp.MustCompile(`^ruby[0-9]+\.[0-9]+$`),
	"dotnet": regexp.MustCompile(`^dotnet-host(-[0-9]+\.[0-9]+)?$`),
	"bun":    regexp.MustCompile(`^bun$`),
	"deno":   regexp.MustCompile(`^deno$`),
}

// brewFormulaPattern 只接受当前语言对应的官方形式名称与版本化 formula。
// 不接受 tap、URL、选项或其他命令参数。
var brewFormulaPattern = regexp.MustCompile(`^(node|go|rust|python|openjdk|php|ruby|dotnet|bun|deno)(@[0-9]+(\.[0-9]+)*)?$`)

// inspectRuntimeTarget 独立核实面板、dpkg、Homebrew 或独立 Go 安装。
// 不运行目标二进制；目标、所有权或来源不能证明时禁止管理。
func inspectRuntimeTarget(ctx context.Context, cfg config.PanelConfig, request Request) (*RuntimeTarget, error) {
	name := RuntimeCommand(request.Kind)
	if name == "" || !safeID.MatchString(request.ID) {
		return nil, errors.New("unsupported runtime identity")
	}
	target := &RuntimeTarget{Command: name}
	if request.Executable == "" {
		evidence, err := inspectRuntime(cfg, request.Kind, request.ID)
		if err != nil {
			return nil, err
		}
		target.Manager, target.Root = "panel", evidence.Path
		target.Executable = filepath.Join(evidence.Path, "bin", name)
	} else {
		digest := sha256.Sum256([]byte(request.Kind + ":" + request.Executable))
		if request.ID != hex.EncodeToString(digest[:16]) || !filepath.IsAbs(request.Executable) || strings.ContainsAny(request.Executable, "\x00\r\n") {
			return nil, errors.New("external runtime identity mismatch")
		}
		path, err := filepath.EvalSymlinks(request.Executable)
		if err != nil || within(cfg.Paths.RuntimeRoot, path) {
			return nil, errors.New("external runtime path unavailable")
		}
		target.Executable = path
		if err = identifyExternalRuntime(ctx, cfg, request.Kind, target); err != nil {
			return nil, err
		}
	}
	if err := runtimeFileOwnership(target.Executable, target.OwnerUID, target.OwnerGID); err != nil {
		return nil, err
	}
	file, err := os.Open(target.Executable)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	hash := sha256.New()
	n, err := io.Copy(hash, io.LimitReader(file, 512<<20+1))
	if err != nil || n > 512<<20 || ctx.Err() != nil {
		return nil, errors.New("cannot fingerprint runtime executable")
	}
	entry := filepath.Join("/usr/local/bin", target.Command)
	link, err := os.Readlink(entry)
	if err != nil && !os.IsNotExist(err) {
		link = "existing-non-symlink"
	}
	fmt.Fprintf(hash, "\x00%s\x00%s\x00%s\x00%s\x00%s\x00%s\x00%d", target.Executable, target.Root, target.Manager, target.Package, target.PackageVersion, link, target.OwnerUID)
	target.Fingerprint = hex.EncodeToString(hash.Sum(nil))
	target.SystemDefault = IsSystemRuntimeDefault(request.Kind, target.Executable)
	return target, nil
}

// runtimeFileOwnership 验证文件与祖先属于 root 或已核实的安装账号及其组。
// Homebrew 允许安装组写入，仍拒绝其他组、全局可写路径和提权可执行位。
func runtimeFileOwnership(path string, owner, group int) error {
	for current := path; ; current = filepath.Dir(current) {
		info, err := os.Lstat(current)
		if err != nil {
			return err
		}
		stat, ok := info.Sys().(*syscall.Stat_t)
		if !ok || !runtimeOwnershipProtected(info.Mode(), stat, owner, group) {
			return errors.New("runtime path ownership is not protected")
		}
		if current == path {
			if !info.Mode().IsRegular() || info.Mode().Perm()&0111 == 0 {
				return errors.New("runtime executable is not a regular executable")
			}
		} else if !info.IsDir() {
			return errors.New("runtime ancestor is not a directory")
		}
		if current == "/" {
			return nil
		}
	}
}

// runtimeOwnershipProtected 区分 root 保护的安装与 Homebrew 的账号、组信任范围。
// 组可写只对非 root 安装所属账号和组开放，其代码始终降权运行。
func runtimeOwnershipProtected(mode os.FileMode, stat *syscall.Stat_t, owner, group int) bool {
	groupWrite := mode.Perm()&0020 != 0
	trustedGroup := owner > 0 && int(stat.Uid) == owner && int(stat.Gid) == group
	return (int(stat.Uid) == owner || stat.Uid == 0) && mode.Perm()&0002 == 0 && (!groupWrite || trustedGroup) && mode&(os.ModeSymlink|os.ModeSetuid|os.ModeSetgid) == 0
}

// homebrewAppProtection 仅向应用只读映射已核实的 Homebrew 前缀及其动态库。
// 其余 home 内容仍被隐藏，避免 ProtectHome=true 同时遮住应用所需的 Node。
func homebrewAppProtection(target *RuntimeTarget) (string, error) {
	prefix, _, ok := strings.Cut(target.Root, "/Cellar/")
	if !ok || !filepath.IsAbs(prefix) || strings.Contains(prefix, ":") {
		return "", errors.New("invalid Homebrew application prefix")
	}
	quoted, err := quoteUnit(prefix)
	if err != nil {
		return "", err
	}
	return "ProtectHome=tmpfs\nBindReadOnlyPaths=" + quoted + "\n", nil
}

// identifyExternalRuntime 从系统包数据库或版本目录证明外部安装来源。
// 独立目录删除仅开放固定 Go 根目录；未知布局保留明确失败。
func identifyExternalRuntime(ctx context.Context, cfg config.PanelConfig, kind string, target *RuntimeTarget) error {
	if before, after, ok := strings.Cut(target.Executable, "/Cellar/"); ok {
		parts := strings.Split(after, "/")
		formulaKind := kind
		if kind == "java" {
			formulaKind = "openjdk"
		}
		if len(parts) < 4 || !brewFormulaPattern.MatchString(parts[0]) || strings.Split(parts[0], "@")[0] != formulaKind {
			return errors.New("Homebrew formula does not match runtime")
		}
		info, err := os.Stat(before)
		if err != nil {
			return err
		}
		stat, ok := info.Sys().(*syscall.Stat_t)
		if !ok || stat.Uid == 0 {
			return errors.New("Homebrew requires a non-root installation owner")
		}
		account, err := user.LookupId(strconv.Itoa(int(stat.Uid)))
		if err != nil || (int(stat.Uid) != cfg.Helper.PanelUID && before != "/home/linuxbrew/.linuxbrew") || (before != "/home/linuxbrew/.linuxbrew" && before != filepath.Join(account.HomeDir, ".linuxbrew")) {
			return errors.New("Homebrew installation owner is not approved")
		}
		target.Manager, target.Package, target.PackageVersion = "homebrew", parts[0], parts[1]
		target.Root = filepath.Join(before, "Cellar", parts[0], parts[1])
		target.OwnerUID, target.OwnerGID, target.Home = int(stat.Uid), int(stat.Gid), account.HomeDir
		if err = runtimeFileOwnership(target.Executable, target.OwnerUID, target.OwnerGID); err != nil {
			return err
		}
		out, err := brewRuntimeCommand(ctx, target, "list", "--versions", "--formula", target.Package)
		if err != nil || strings.TrimSpace(string(out)) != target.Package+" "+target.PackageVersion {
			return errors.New("Homebrew target must be the single installed formula version")
		}
		return nil
	}
	if err := runtimeFileOwnership(target.Executable, 0, 0); err != nil {
		return err
	}
	out, err := fixedCommand(ctx, "/usr/bin/dpkg-query", "--search", target.Executable)
	if err == nil {
		pkg, err := runtimePackageOwner(kind, target.Executable, string(out))
		if err != nil {
			return err
		}
		out, err = fixedCommand(ctx, "/usr/bin/dpkg-query", "--show", "--showformat=${Status}\n${Version}\n${Essential}\n${Protected}\n", pkg)
		if err != nil {
			return err
		}
		fields := strings.Split(strings.TrimSuffix(string(out), "\n"), "\n")
		if len(fields) != 4 || fields[0] != "install ok installed" || fields[1] == "" {
			return errors.New("system package is not fully installed")
		}
		target.Manager, target.Package, target.PackageVersion = "apt", pkg, fields[1]
		target.Root = target.Executable
		if fields[2] == "yes" || fields[3] == "yes" {
			target.RemovalBlocked = "系统标记为 Essential/Protected 的软件包不能卸载"
		}
		return nil
	}
	if kind == "go" && (target.Executable == "/usr/local/go/bin/go" || target.Executable == "/opt/go/bin/go") {
		target.Manager, target.Root = "standalone", filepath.Dir(filepath.Dir(target.Executable))
		for _, path := range []string{"VERSION", "src/runtime/runtime.go"} {
			info, err := os.Lstat(filepath.Join(target.Root, path))
			if err != nil || !info.Mode().IsRegular() {
				return errors.New("standalone Go installation layout is not proven")
			}
		}
		return nil
	}
	return errors.New("runtime installation source is not supported")
}

// runtimePackageOwner 只采用精确路径和单一允许包的归属记录。
// diversion、多个拥有者和伪造的文件匹配不能扩大卸载范围。
func runtimePackageOwner(kind, path, output string) (string, error) {
	pattern := runtimePackagePatterns[kind]
	lines := strings.Split(strings.TrimSpace(output), "\n")
	if pattern == nil || len(lines) != 1 {
		return "", errors.New("ambiguous runtime package ownership")
	}
	pkg, ownedPath, ok := strings.Cut(lines[0], ": ")
	name, arch, qualified := strings.Cut(pkg, ":")
	if !ok || ownedPath != path || !pattern.MatchString(name) || qualified && !regexp.MustCompile(`^[a-z0-9]+$`).MatchString(arch) {
		return "", errors.New("runtime package ownership not allowed")
	}
	return pkg, nil
}

// brewRuntimeCommand 降为安装所属账号运行固定 Homebrew 操作。
// 不传数据库凭据、不加载 shell，不以 root 执行用户可改写的 brew 代码。
func brewRuntimeCommand(ctx context.Context, target *RuntimeTarget, args ...string) ([]byte, error) {
	prefix, _, ok := strings.Cut(target.Root, "/Cellar/")
	if !ok || target.OwnerUID <= 0 {
		return nil, errors.New("invalid Homebrew target")
	}
	brew, err := filepath.EvalSymlinks(filepath.Join(prefix, "bin/brew"))
	if err != nil || !within(prefix, brew) {
		return nil, errors.New("Homebrew executable unavailable")
	}
	if err = runtimeFileOwnership(brew, target.OwnerUID, target.OwnerGID); err != nil {
		return nil, err
	}
	command := exec.CommandContext(ctx, brew, args...)
	command.Dir = "/"
	command.Env = []string{"PATH=" + prefix + "/bin:/usr/bin:/bin", "HOME=" + target.Home, "LANG=C", "LC_ALL=C", "HOMEBREW_NO_AUTO_UPDATE=1", "HOMEBREW_NO_ANALYTICS=1", "HOMEBREW_NO_ENV_HINTS=1", "HOMEBREW_NO_INSTALL_CLEANUP=1", "HOMEBREW_NO_INSTALL_FROM_API=1"}
	command.SysProcAttr = &syscall.SysProcAttr{Credential: &syscall.Credential{Uid: uint32(target.OwnerUID), Gid: uint32(target.OwnerGID)}}
	output, diagnostic := &boundedBuffer{limit: 1 << 20}, &boundedBuffer{limit: 16 << 10}
	command.Stdout, command.Stderr, command.WaitDelay = output, diagnostic, time.Second
	if err = command.Run(); err != nil {
		return nil, errors.New("Homebrew runtime command failed")
	}
	return output.Bytes(), nil
}

// runtimeRemovalCheck 让包管理器先核实依赖，不扩大到自动卸载其他软件包。
// 最终提交仍再次执行相同检查，并保留包管理器自身的依赖保护。
func runtimeRemovalCheck(ctx context.Context, target *RuntimeTarget) error {
	if target.RemovalBlocked != "" {
		return errors.New(target.RemovalBlocked)
	}
	switch target.Manager {
	case "apt":
		_, err := fixedCommand(ctx, "/usr/bin/dpkg", "--refuse-all", "--no-act", "--remove", target.Package)
		return err
	case "homebrew":
		out, err := brewRuntimeCommand(ctx, target, "uses", "--installed", "--recursive", target.Package)
		if err != nil || strings.TrimSpace(string(out)) != "" {
			return errors.New("Homebrew formula has dependants or dependency check failed")
		}
	case "panel", "standalone":
	default:
		return errors.New("unsupported runtime removal source")
	}
	return nil
}

// runtimeTargetReferences 覆盖包内可执行文件以及常见符号链接入口。
// 任一包清单或引用读取失败都会保留不完整状态，禁止卸载。
func runtimeTargetReferences(ctx context.Context, target *RuntimeTarget) (int, bool, []int) {
	paths := []string{target.Root}
	if target.Manager == "apt" {
		out, err := fixedCommand(ctx, "/usr/bin/dpkg-query", "--listfiles", target.Package)
		if err != nil {
			return 0, false, nil
		}
		for _, path := range strings.Split(string(out), "\n") {
			if !filepath.IsAbs(path) {
				continue
			}
			if info, err := os.Stat(path); err == nil && info.Mode().IsRegular() && info.Mode().Perm()&0111 != 0 {
				paths = append(paths, path)
			}
		}
	}
	aliases := []string{filepath.Join("/usr/local/bin", target.Command), filepath.Join("/usr/bin", target.Command), filepath.Join("/bin", target.Command)}
	if target.Manager == "homebrew" {
		prefix, _, _ := strings.Cut(target.Root, "/Cellar/")
		aliases = append(aliases, filepath.Join(prefix, "bin", target.Command), filepath.Join(prefix, "opt", target.Package, "bin", target.Command))
	}
	for _, alias := range aliases {
		if path, err := filepath.EvalSymlinks(alias); err == nil && (path == target.Executable || within(target.Root, path)) {
			paths = append(paths, alias)
		}
	}
	count, complete := 0, true
	pids, seen, processIDs := []int{}, map[string]bool{}, map[int]bool{}
	for _, path := range paths {
		if ctx.Err() != nil {
			return count, false, pids
		}
		if seen[path] {
			continue
		}
		seen[path] = true
		refs, checked, found := referencesIn(path, true)
		count += refs
		complete = complete && checked && ctx.Err() == nil
		for _, pid := range found {
			if !processIDs[pid] {
				pids = append(pids, pid)
				processIDs[pid] = true
			}
		}
	}
	return count, complete, pids
}

// setSystemRuntimeDefault 只原子切换 /usr/local/bin 中的固定入口。
// 原有普通文件不覆盖，/usr/bin 的包文件与 alternatives 保持不变。
func setSystemRuntimeDefault(target *RuntimeTarget) error {
	// 全局入口可能被 root 使用，不能指向面板账号可改写的 Homebrew 程序。
	if target.OwnerUID != 0 {
		return errors.New("system default requires a root-protected runtime")
	}
	if err := protectedRoot("/usr/local/bin"); err != nil {
		return err
	}
	root, err := os.OpenRoot("/usr/local/bin")
	if err != nil {
		return err
	}
	defer root.Close()
	return replaceRuntimeLink(root, target.Command, target.Executable)
}

// replaceRuntimeLink 在已打开的系统入口目录内原子替换链接。
// 目录句柄限定写入范围，原有普通文件、目录和不合法命令名均不覆盖。
func replaceRuntimeLink(root *os.Root, command, executable string) error {
	if command == "" || filepath.Base(command) != command || command == "." || command == ".." || !filepath.IsAbs(executable) {
		return errors.New("invalid system runtime entry")
	}
	if info, err := root.Lstat(command); err == nil {
		if info.Mode()&os.ModeSymlink == 0 {
			return errors.New("system entry is an existing non-symlink file")
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	name := ".zx-panel-default-" + rand.Text()
	if err := root.Symlink(executable, name); err != nil {
		return err
	}
	defer root.Remove(name)
	return root.Rename(name, command)
}

// removeExternalRuntime 通过固定的短期 systemd 作业执行已经核实的卸载。
// 不放宽常驻 helper 的只读系统沙箱，作业超时会终止整个进程组。
func removeExternalRuntime(ctx context.Context, id string, target *RuntimeTarget) error {
	args, err := runtimeRemovalCommand(id, target)
	if err != nil {
		return err
	}
	_, err = fixedCommand(ctx, "/usr/bin/systemd-run", args...)
	if err != nil {
		return err
	}
	if _, err = os.Stat(target.Executable); !os.IsNotExist(err) {
		return errors.New("runtime executable still exists after removal")
	}
	return nil
}

// runtimeRemovalCommand 仅构造已支持来源的固定参数，绝不使用 shell。
// dpkg 不自动移除依赖；Homebrew 不使用 force 或 ignore-dependencies。
func runtimeRemovalCommand(id string, target *RuntimeTarget) ([]string, error) {
	if !safeID.MatchString(id) {
		return nil, errors.New("invalid runtime job identity")
	}
	args := []string{"--quiet", "--wait", "--pipe", "--collect", "--no-ask-password", "--expand-environment=no", "--working-directory=/", "--unit=zx-panel-runtime-" + id, "--property=Type=exec", "--property=RuntimeMaxSec=90", "--property=TimeoutStopSec=10", "--property=KillMode=control-group", "--property=NoNewPrivileges=yes", "--property=PrivateTmp=yes", "--property=RestrictAddressFamilies=AF_UNIX", "--property=ProtectKernelTunables=yes", "--property=ProtectKernelModules=yes", "--property=ProtectControlGroups=yes", "--property=CapabilityBoundingSet=CAP_CHOWN CAP_DAC_OVERRIDE CAP_DAC_READ_SEARCH CAP_FOWNER CAP_SETGID CAP_SETUID CAP_KILL", "--setenv=PATH=/usr/bin:/bin", "--setenv=LANG=C", "--setenv=LC_ALL=C"}
	switch target.Manager {
	case "apt":
		if !regexp.MustCompile(`^[a-z0-9][a-z0-9+.-]*(:[a-z0-9]+)?$`).MatchString(target.Package) {
			return nil, errors.New("invalid package name")
		}
		args = append(args, "--", "/usr/bin/dpkg", "--refuse-all", "--remove", target.Package)
	case "homebrew":
		prefix, _, ok := strings.Cut(target.Root, "/Cellar/")
		if !ok || target.OwnerUID <= 0 || !brewFormulaPattern.MatchString(target.Package) {
			return nil, errors.New("invalid Homebrew removal target")
		}
		args = append(args, "--uid="+strconv.Itoa(target.OwnerUID), "--gid="+strconv.Itoa(target.OwnerGID), "--setenv=HOME="+target.Home, "--setenv=PATH="+prefix+"/bin:/usr/bin:/bin", "--setenv=HOMEBREW_NO_AUTO_UPDATE=1", "--setenv=HOMEBREW_NO_ANALYTICS=1", "--setenv=HOMEBREW_NO_INSTALL_CLEANUP=1", "--setenv=HOMEBREW_NO_INSTALL_FROM_API=1", "--", filepath.Join(prefix, "bin/brew"), "uninstall", "--formula", target.Package)
	case "standalone":
		if target.Root != "/usr/local/go" && target.Root != "/opt/go" {
			return nil, errors.New("standalone removal root not allowed")
		}
		args = append(args, "--", "/usr/bin/rm", "--recursive", "--one-file-system", "--", target.Root)
	default:
		return nil, errors.New("unsupported external removal source")
	}
	return args, nil
}
