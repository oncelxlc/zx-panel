//go:build linux

package host

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"golang.org/x/sys/unix"
	"io"
	"log/slog"
	"net"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	"zx-panel/internal/config"
	"zx-panel/internal/security"
)

// safeID 固定 helper 文件名组成，路径与 unit 名称不由请求自由指定。
// ID 必须来自面板生成的十六进制随机值。
var safeID = regexp.MustCompile(`^[a-f0-9]{32}$`)

// safeVersion 验证运行时的具体稳定版本，禁止附加命令参数。
// Go 和 Node 均使用规范化的数字版本。
var safeVersion = regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+$`)

// helperMutex 串行化有副作用动作，保护 root 拥有的目录提交。
// ponytail: 单服务器管理不需要复杂分布式锁表。
var helperMutex sync.Mutex

// boundedBuffer 在保留有限输出的同时拒绝无限命令输出。
// 达到限额会让命令调用失败，不把截断结果当作完整成功。
type boundedBuffer struct {
	bytes.Buffer
	limit int
}

// Write 为 stdout 和 stderr 建立硬上限。
// 该缓冲不会进入 API 成功响应。
func (b *boundedBuffer) Write(p []byte) (int, error) {
	if b.Len()+len(p) > b.limit {
		return 0, errors.New("helper output limit exceeded")
	}
	return b.Buffer.Write(p)
}

// Run 只监听 Unix Socket，并以 SO_PEERCRED 验证调用者身份。
// 必须由 root 的独立 systemd 单元运行，web 服务不得以 root 启动。
func Run(ctx context.Context, cfg config.PanelConfig) error {
	if os.Geteuid() != 0 {
		return errors.New("helper must run as root")
	}
	if !cfg.Helper.Enabled || cfg.Helper.PanelUID <= 0 {
		return errors.New("helper requires a non-root panelUid")
	}
	for _, directory := range []string{cfg.Paths.RuntimeRoot, "/etc/zx-panel/apps", "/etc/systemd/system"} {
		if err := protectedRoot(directory); err != nil {
			return err
		}
	}
	if err := os.Chmod(cfg.Paths.RuntimeRoot, 0755); err != nil {
		return err
	}
	for _, kind := range []string{"node", "go"} {
		directory := filepath.Join(cfg.Paths.RuntimeRoot, kind)
		if err := protectedRoot(directory); err != nil {
			return err
		}
		if err := os.Chmod(directory, 0755); err != nil {
			return err
		}
	}
	parent := filepath.Dir(cfg.Helper.SocketPath)
	if err := os.MkdirAll(parent, 0755); err != nil {
		return err
	}
	stat, err := os.Lstat(parent)
	if err != nil || !stat.IsDir() || stat.Mode().Perm()&0022 != 0 {
		return errors.New("unsafe helper socket directory")
	}
	if raw, ok := stat.Sys().(*syscall.Stat_t); !ok || raw.Uid != 0 {
		return errors.New("helper socket directory must be root owned")
	}
	if old, err := os.Lstat(cfg.Helper.SocketPath); err == nil {
		if old.Mode()&os.ModeSocket == 0 {
			return errors.New("socket path is not a socket")
		}
		connection, err := net.DialTimeout("unix", cfg.Helper.SocketPath, time.Second)
		if err == nil {
			connection.Close()
			return errors.New("helper already running")
		}
		if err = os.Remove(cfg.Helper.SocketPath); err != nil {
			return err
		}
	}
	listener, err := net.ListenUnix("unix", &net.UnixAddr{Name: cfg.Helper.SocketPath, Net: "unix"})
	if err != nil {
		return err
	}
	defer listener.Close()
	if err = os.Chmod(cfg.Helper.SocketPath, 0600); err != nil {
		return err
	}
	if err = os.Chown(cfg.Helper.SocketPath, cfg.Helper.PanelUID, -1); err != nil {
		return err
	}
	stop := context.AfterFunc(ctx, func() { listener.Close() })
	defer stop()
	slots := make(chan struct{}, 8)
	var handlers sync.WaitGroup
	defer handlers.Wait()
	for {
		connection, err := listener.AcceptUnix()
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			return err
		}
		select {
		case slots <- struct{}{}:
			handlers.Add(1)
			go func() { defer handlers.Done(); defer func() { <-slots }(); handleConnection(ctx, cfg, connection) }()
		default:
			connection.Close()
		}
	}
}

// handleConnection 先验对端，再严格解码一个有界请求。
// 错误响应不包含环境值、路径内容或命令输出。
func handleConnection(parent context.Context, cfg config.PanelConfig, connection *net.UnixConn) {
	defer connection.Close()
	raw, err := connection.SyscallConn()
	if err != nil {
		return
	}
	allowed := false
	if err = raw.Control(func(fd uintptr) {
		peer, e := unix.GetsockoptUcred(int(fd), unix.SOL_SOCKET, unix.SO_PEERCRED)
		allowed = e == nil && int(peer.Uid) == cfg.Helper.PanelUID
	}); err != nil || !allowed {
		return
	}
	if err = connection.SetDeadline(time.Now().Add(2 * time.Minute)); err != nil {
		return
	}
	body, err := bufio.NewReader(io.LimitReader(connection, 1<<20+1)).ReadBytes('\n')
	if err != nil || len(body) > 1<<20 {
		return
	}
	var request Request
	if err = security.DecodeBytes(body, &request); err != nil {
		_ = json.NewEncoder(connection).Encode(Result{Code: "INVALID_INPUT"})
		return
	}
	ctx, cancel := context.WithTimeout(parent, 110*time.Second)
	defer cancel()
	go func() { var b [1]byte; _, _ = connection.Read(b[:]); cancel() }()
	result, err := execute(ctx, cfg, request)
	if err != nil {
		slog.Warn("helper action rejected", "action", request.Action, "resource", request.ID, "error", err)
		result = Result{Code: "HOST_ACTION_FAILED"}
	}
	_ = json.NewEncoder(connection).Encode(result)
}

// fixedCommand 固定二进制位置并使用参数数组，不经过 shell。
// 每个命令都有超时、干净环境和有界输出。
func fixedCommand(ctx context.Context, program string, args ...string) ([]byte, error) {
	command := exec.CommandContext(ctx, program, args...)
	command.Env = []string{"PATH=/usr/bin:/bin", "LANG=C.UTF-8", "LC_ALL=C.UTF-8", "SYSTEMD_PAGER=cat", "SYSTEMD_COLORS=0"}
	out := &boundedBuffer{limit: 12 << 20}
	diagnostic := &boundedBuffer{limit: 16 << 10}
	command.Stdout = out
	command.Stderr = diagnostic
	command.WaitDelay = 2 * time.Second
	if err := command.Run(); err != nil {
		return nil, fmt.Errorf("fixed command %s failed: %w", filepath.Base(program), err)
	}
	return out.Bytes(), nil
}

// unitPath 只构造面板生成的固定 unit 名称。
// 空 ID、路径和其他系统服务全部拒绝。
func unitPath(id string) (string, error) {
	if !safeID.MatchString(id) {
		return "", errors.New("invalid managed resource ID")
	}
	return "/etc/systemd/system/zx-panel-app-" + id + ".service", nil
}

// ownedUnit 验证目标是 root 拥有且带精确面板标识的普通文件。
// 任意既有系统服务不能通过名称相似混入。
func ownedUnit(id string) error {
	path, err := unitPath(id)
	if err != nil {
		return err
	}
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0022 != 0 {
		return errors.New("unit is not a protected regular file")
	}
	raw, ok := info.Sys().(*syscall.Stat_t)
	if !ok || raw.Uid != 0 {
		return errors.New("unit is not root owned")
	}
	body, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if !bytes.HasPrefix(body, []byte("# Managed by zx-panel\n# id="+id+"\n")) {
		return errors.New("unit ownership marker missing")
	}
	return nil
}

// execute 仅开放经过审核的动作枚举。
// 查询不会与长时间下载共享 web 进程权限。
func execute(ctx context.Context, cfg config.PanelConfig, request Request) (Result, error) {
	if request.Action == "probe" {
		if _, err := os.Stat("/run/systemd/system"); err != nil {
			return Result{}, err
		}
		return Result{OK: true}, nil
	}
	if request.Action == "runtime.references" {
		path, err := runtimePath(cfg, request.Kind, request.ID)
		if err != nil {
			return Result{}, err
		}
		refs, complete, pids := references(path)
		return Result{OK: true, References: &refs, Complete: complete, ProcessIDs: pids}, nil
	}
	if request.Action == "runtime.inspect" {
		evidence, err := inspectRuntime(cfg, request.Kind, request.ID)
		return Result{OK: err == nil, Installation: evidence}, err
	}
	if request.Action == "app.status" {
		if err := ownedUnit(request.ID); err != nil {
			return Result{}, err
		}
		state, err := readState(ctx, request.ID)
		return Result{OK: err == nil, State: &state}, err
	}
	if request.Action == "app.logs" {
		if err := ownedUnit(request.ID); err != nil {
			return Result{}, err
		}
		lines, err := journal(ctx, request)
		bytes := 0
		for _, line := range lines {
			bytes += len(line.Message)
		}
		return Result{OK: err == nil, Lines: lines, More: len(lines) >= request.Limit || bytes >= 8<<20}, err
	}
	helperMutex.Lock()
	defer helperMutex.Unlock()
	switch request.Action {
	case "runtime.commit":
		path, err := commitRuntime(ctx, cfg, request)
		return Result{OK: err == nil, Path: path}, err
	case "runtime.remove":
		path, err := runtimePath(cfg, request.Kind, request.ID)
		if err != nil {
			return Result{}, err
		}
		refs, complete, _ := references(path)
		if !complete || refs > 0 {
			return Result{}, errors.New("runtime still referenced or check incomplete")
		}
		if _, err := runtimeMarker(cfg, request.Kind, request.ID); err != nil {
			return Result{}, errors.New("installation ownership not proven")
		}
		root, err := os.OpenRoot(filepath.Join(cfg.Paths.RuntimeRoot, request.Kind))
		if err != nil {
			return Result{}, err
		}
		defer root.Close()
		err = root.RemoveAll(request.ID)
		return Result{OK: err == nil}, err
	case "app.write":
		if request.Definition == nil || request.ID != request.Definition.ID {
			return Result{}, errors.New("definition missing")
		}
		err := writeUnit(ctx, cfg, *request.Definition)
		return Result{OK: err == nil}, err
	case "app.start", "app.stop", "app.restart", "app.delete":
		if err := ownedUnit(request.ID); err != nil {
			return Result{}, err
		}
		unit := "zx-panel-app-" + request.ID + ".service"
		if request.Action == "app.delete" {
			state, err := readState(ctx, request.ID)
			if err != nil {
				return Result{}, err
			}
			if state.Status == "running" || state.Status == "starting" || state.Status == "stopping" {
				return Result{}, errors.New("application must be stopped before removing registration")
			}
			if _, err = fixedCommand(ctx, "/usr/bin/systemctl", "disable", unit); err != nil {
				return Result{}, err
			}
			path, _ := unitPath(request.ID)
			if err = os.Remove(path); err != nil {
				return Result{}, err
			}
			if err = os.Remove("/etc/zx-panel/apps/" + request.ID + ".env"); err != nil && !os.IsNotExist(err) {
				return Result{}, err
			}
			_, err = fixedCommand(ctx, "/usr/bin/systemctl", "daemon-reload")
			return Result{OK: err == nil}, err
		}
		verb := strings.TrimPrefix(request.Action, "app.")
		if _, err := fixedCommand(ctx, "/usr/bin/systemctl", verb, unit); err != nil {
			return Result{}, err
		}
		state, err := readState(ctx, request.ID)
		return Result{OK: err == nil, State: &state}, err
	default:
		return Result{}, errors.New("unsupported helper action")
	}
}

// within 使用真实路径包含关系限定应用可执行文件。
// 路径兄弟前缀不能绕过配置批准根目录。
func within(root, path string) bool {
	rel, err := filepath.Rel(root, path)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}

// permitted 解析符号链接并检查批准目录。
// 管理动作不接受目录外的目标。
func permitted(path string, roots []string) (string, error) {
	if !filepath.IsAbs(path) || strings.ContainsAny(path, "\x00\r\n") {
		return "", errors.New("invalid absolute path")
	}
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", err
	}
	for _, root := range roots {
		real, err := filepath.EvalSymlinks(root)
		if err == nil && within(real, resolved) {
			return resolved, nil
		}
	}
	return "", errors.New("path not approved")
}

// quoteUnit 引用一个完整参数，并转义 systemd 的百分号和变量扩展。
// 参数空格原样保留，换行和 NUL 永远不能注入新指令。
func quoteUnit(value string) (string, error) {
	if strings.ContainsAny(value, "\x00\r\n") {
		return "", errors.New("unit argument contains control character")
	}
	value = strings.NewReplacer("\\", "\\\\", "\"", "\\\"", "%", "%%").Replace(value)
	return "\"" + value + "\"", nil
}

// writeUnit 独立验证服务账号、目录、命令与环境，再原子保存配置。
// 只 daemon-reload，不隐式启动或重启应用。
func writeUnit(ctx context.Context, cfg config.PanelConfig, def Definition) error {
	path, err := unitPath(def.ID)
	if err != nil {
		return err
	}
	if err = protectedRoot(cfg.Paths.RuntimeRoot); err != nil {
		return err
	}
	if !slices.Contains(cfg.Helper.ServiceAccounts, def.User) {
		return errors.New("service account not allowed")
	}
	account, err := user.Lookup(def.User)
	if err != nil || account.Uid == "0" || account.Uid == strconv.Itoa(cfg.Helper.PanelUID) {
		return errors.New("root or unknown service account")
	}
	directory, err := permitted(def.Directory, cfg.Paths.AppRoots)
	if err != nil {
		return err
	}
	if info, err := os.Stat(directory); err != nil || !info.IsDir() {
		return errors.New("working directory unavailable")
	}
	executable, err := permitted(def.Executable, append(append([]string{}, cfg.Paths.AppRoots...), cfg.Paths.RuntimeRoot))
	if err != nil {
		return err
	}
	info, err := os.Stat(executable)
	if err != nil || !info.Mode().IsRegular() || info.Mode().Perm()&0111 == 0 || info.Mode()&(os.ModeSetuid|os.ModeSetgid) != 0 {
		return errors.New("executable not suitable")
	}
	if def.Restart != "no" && def.Restart != "on-failure" {
		return errors.New("invalid restart policy")
	}
	if len(def.Args) > 128 || len(def.Environment) > 100 {
		return errors.New("definition too large")
	}
	if _, err := os.Lstat(path); err == nil {
		if err = ownedUnit(def.ID); err != nil {
			return err
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	exe, err := quoteUnit(executable)
	if err != nil {
		return err
	}
	arguments := []string{strings.ReplaceAll(exe, "$", "$$")}
	total := 0
	for _, arg := range def.Args {
		total += len(arg)
		quoted, err := quoteUnit(arg)
		if err != nil {
			return err
		}
		arguments = append(arguments, strings.ReplaceAll(quoted, "$", "$$"))
	}
	if total > 32<<10 {
		return errors.New("arguments too large")
	}
	// WorkingDirectory 是单个原始路径，ReadWritePaths 与 ExecStart 才使用带引号的列表语法。
	if directory != strings.TrimSpace(directory) || strings.HasSuffix(directory, "\\") {
		return errors.New("working directory has an unsupported trailing character")
	}
	working := strings.ReplaceAll(directory, "%", "%%")
	writable, _ := quoteUnit(directory)
	username := account.Uid
	envPath := "/etc/zx-panel/apps/" + def.ID + ".env"
	if err = os.MkdirAll(filepath.Dir(envPath), 0700); err != nil {
		return err
	}
	var env strings.Builder
	names := make([]string, 0, len(def.Environment))
	envTotal := 0
	for key, value := range def.Environment {
		if !validEnvKey(key) || strings.ContainsRune(value, 0) {
			return errors.New("invalid environment item")
		}
		envTotal += len(value)
		names = append(names, key)
	}
	if envTotal > 64<<10 {
		return errors.New("environment too large")
	}
	slices.Sort(names)
	for _, key := range names {
		value := strings.NewReplacer("\\", "\\\\", "\"", "\\\"", "`", "\\`", "$", "\\$").Replace(def.Environment[key])
		env.WriteString(key + "=\"" + value + "\"\n")
	}
	if err = atomicWrite(envPath, []byte(env.String()), 0600); err != nil {
		return err
	}
	body := fmt.Sprintf("# Managed by zx-panel\n# id=%s\n[Unit]\nDescription=zx-panel managed application %s\nAfter=network.target\nStartLimitIntervalSec=60\nStartLimitBurst=5\n[Service]\nType=exec\nUser=%s\nWorkingDirectory=%s\nExecStart=%s\nEnvironmentFile=%s\nRestart=%s\nRestartSec=3\nTimeoutStopSec=30\nKillMode=control-group\nNoNewPrivileges=true\nPrivateTmp=true\nProtectSystem=strict\nReadWritePaths=%s\nProtectHome=true\nRestrictSUIDSGID=true\nCapabilityBoundingSet=\nUMask=0077\nCPUAccounting=true\nMemoryAccounting=true\nStandardOutput=journal\nStandardError=journal\n[Install]\nWantedBy=multi-user.target\n", def.ID, def.ID, username, working, strings.Join(arguments, " "), envPath, def.Restart, writable)
	if err = atomicWrite(path, []byte(body), 0644); err != nil {
		return err
	}
	_, err = fixedCommand(ctx, "/usr/bin/systemctl", "daemon-reload")
	return err
}

// validEnvKey 只允许 POSIX 环境变量名，防止写入环境文件指令。
// 前后空白不会被隐式修剪。
func validEnvKey(key string) bool {
	if len(key) < 1 || len(key) > 128 {
		return false
	}
	for i, c := range key {
		if c != '_' && (c < 'A' || c > 'Z') && (c < 'a' || c > 'z') && (i == 0 || c < '0' || c > '9') {
			return false
		}
	}
	return true
}

// atomicWrite 在同目录同步临时文件后重命名。
// 失败保留旧配置，临时文件不作为有效资源使用。
func atomicWrite(path string, body []byte, mode os.FileMode) error {
	file, err := os.CreateTemp(filepath.Dir(path), ".zx-panel-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	if err = file.Chmod(mode); err == nil {
		_, err = file.Write(body)
	}
	if err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Rename(file.Name(), path)
}

// runtimePath 限定 root helper 管理的版本目录。
// 不接受浏览器传来的完整路径或自定义运行时类别。
func runtimePath(cfg config.PanelConfig, kind, id string) (string, error) {
	if !safeID.MatchString(id) || (kind != "node" && kind != "go") {
		return "", errors.New("invalid runtime identity")
	}
	return filepath.Join(cfg.Paths.RuntimeRoot, kind, id), nil
}

// references 从 procfs 和面板 unit 检查运行及配置引用。
// 权限不足或扫描失败时返回不完整，调用方必须阻止删除。
func references(root string) (int, bool, []int) {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return 0, false, nil
	}
	count, complete := 0, true
	pids := []int{}
	for _, entry := range entries {
		if _, err := strconv.Atoi(entry.Name()); err != nil {
			continue
		}
		target, err := os.Readlink("/proc/" + entry.Name() + "/exe")
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			complete = false
			continue
		}
		if within(root, strings.TrimSuffix(target, " (deleted)")) {
			count++
			pid, _ := strconv.Atoi(entry.Name())
			pids = append(pids, pid)
		}
	}
	units, err := os.ReadDir("/etc/systemd/system")
	if err != nil {
		return count, false, pids
	}
	quoted, _ := quoteUnit(root + string(filepath.Separator))
	needle := strings.ReplaceAll(strings.Trim(quoted, "\""), "$", "$$")
	for _, unit := range units {
		if !strings.HasPrefix(unit.Name(), "zx-panel-app-") || !strings.HasSuffix(unit.Name(), ".service") {
			continue
		}
		body, err := os.ReadFile(filepath.Join("/etc/systemd/system", unit.Name()))
		if err != nil {
			complete = false
			continue
		}
		if strings.Contains(string(body), needle) {
			count++
		}
	}
	return count, complete, pids
}

// runtimeMarker 核实原子提交留下的 root 标记与安装目录，拒绝符号链接替代品。
// 不执行二进制，也不触发重新安装；证据不足即停止恢复。
func runtimeMarker(cfg config.PanelConfig, kind, id string) (*InstallationEvidence, error) {
	path, err := runtimePath(cfg, kind, id)
	if err != nil {
		return nil, err
	}
	if _, err = os.Lstat(path); err != nil {
		return nil, err
	}
	if err = protectedRoot(path); err != nil {
		return nil, err
	}
	markerInfo, err := os.Lstat(filepath.Join(path, ".zx-panel-install.json"))
	if err != nil || !markerInfo.Mode().IsRegular() {
		return nil, errors.New("runtime marker must be regular")
	}
	marker, err := os.Open(filepath.Join(path, ".zx-panel-install.json"))
	if err != nil {
		return nil, err
	}
	defer marker.Close()
	stat, err := marker.Stat()
	if err != nil || !stat.Mode().IsRegular() || stat.Size() > 4096 || stat.Mode().Perm()&0022 != 0 {
		return nil, errors.New("unsafe runtime marker")
	}
	if raw, ok := stat.Sys().(*syscall.Stat_t); !ok || raw.Uid != 0 {
		return nil, errors.New("runtime marker must be root owned")
	}
	var evidence InstallationEvidence
	if err = json.NewDecoder(io.LimitReader(marker, 4097)).Decode(&evidence); err != nil {
		return nil, err
	}
	if evidence.ID != id || evidence.Kind != kind || !safeVersion.MatchString(evidence.Version) || len(evidence.SHA256) != 64 {
		return nil, errors.New("runtime marker mismatch")
	}
	if _, err = hex.DecodeString(evidence.SHA256); err != nil {
		return nil, err
	}
	evidence.Path = path
	evidence.InstalledAt = stat.ModTime().UTC()
	return &evidence, nil
}

// inspectRuntime 只在提交标记和真实可执行文件都可核实时认定已完成安装。
// 损坏安装仍可凭 root 标记进入受保护的卸载检查。
func inspectRuntime(cfg config.PanelConfig, kind, id string) (*InstallationEvidence, error) {
	evidence, err := runtimeMarker(cfg, kind, id)
	if err != nil {
		return nil, err
	}
	binary := "node"
	if kind == "go" {
		binary = "go"
	}
	exe, err := os.Lstat(filepath.Join(evidence.Path, "bin", binary))
	if err != nil || !exe.Mode().IsRegular() || exe.Mode().Perm()&0111 == 0 || exe.Mode().Perm()&0022 != 0 {
		return nil, errors.New("runtime executable unavailable")
	}
	return evidence, nil
}

// commitRuntime 在 root 拥有的暂存目录内重验摘要、解包及受限身份版本。
// 原子重命名后仍保留旧安装，拒绝覆盖既有 ID。
func commitRuntime(ctx context.Context, cfg config.PanelConfig, request Request) (string, error) {
	if err := protectedRoot(cfg.Paths.RuntimeRoot); err != nil {
		return "", err
	}
	target, err := runtimePath(cfg, request.Kind, request.ID)
	if err != nil {
		return "", err
	}
	if !safeID.MatchString(request.StageID) || !safeVersion.MatchString(request.Version) || len(request.SHA256) != 64 {
		return "", errors.New("invalid artifact identity")
	}
	root, err := os.OpenRoot(cfg.Paths.StagingRoot)
	if err != nil {
		return "", err
	}
	defer root.Close()
	source, err := root.Open(request.StageID + "/archive.tar.gz")
	if err != nil {
		return "", err
	}
	defer source.Close()
	stopRead := context.AfterFunc(ctx, func() { _ = source.Close() })
	defer stopRead()
	if err = protectedRoot(filepath.Dir(target)); err != nil {
		return "", err
	}
	if err = os.Chmod(filepath.Dir(target), 0755); err != nil {
		return "", err
	}
	stage, err := os.MkdirTemp(filepath.Dir(target), ".install-*")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(stage)
	archive, err := os.OpenFile(filepath.Join(stage, "archive.tar.gz"), os.O_RDWR|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return "", err
	}
	defer archive.Close()
	hash := sha256.New()
	size, err := io.Copy(io.MultiWriter(archive, hash), io.LimitReader(source, 512<<20+1))
	if err != nil || size > 512<<20 {
		return "", errors.New("archive copy exceeds limit")
	}
	if hex.EncodeToString(hash.Sum(nil)) != request.SHA256 {
		return "", errors.New("artifact checksum mismatch")
	}
	if _, err = archive.Seek(0, 0); err != nil {
		return "", err
	}
	unpacked := filepath.Join(stage, "unpacked")
	if err = os.Mkdir(unpacked, 0755); err != nil {
		return "", err
	}
	if err = security.ExtractTarGzip(ctx, archive, unpacked, request.ArchiveRoot, 2<<30, 100000); err != nil {
		return "", err
	}
	if err = os.Chmod(stage, 0755); err != nil {
		return "", err
	}
	if len(cfg.Helper.ServiceAccounts) == 0 {
		return "", errors.New("verification account unavailable")
	}
	account, err := user.Lookup(cfg.Helper.ServiceAccounts[0])
	if err != nil {
		return "", err
	}
	uid, e1 := strconv.ParseUint(account.Uid, 10, 32)
	gid, e2 := strconv.ParseUint(account.Gid, 10, 32)
	if e1 != nil || e2 != nil || uid == 0 || int(uid) == cfg.Helper.PanelUID {
		return "", errors.New("verification account must be non-root")
	}
	binary := "node"
	args := []string{"--version"}
	expected := "v" + request.Version
	if request.Kind == "go" {
		binary = "go"
		args = []string{"version"}
		expected = "go version go" + request.Version + " "
	}
	verifyCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	command := exec.CommandContext(verifyCtx, filepath.Join(unpacked, "bin", binary), args...)
	command.Env = []string{"PATH=/usr/bin:/bin", "HOME=/nonexistent", "LANG=C", "GOTOOLCHAIN=local"}
	command.Dir = "/"
	// Go syscall/exec_linux.go 在 NoSetGroups=false 时调用 setgroups；空 Groups 会清空 root helper 的附加组。
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true, Credential: &syscall.Credential{Uid: uint32(uid), Gid: uint32(gid), Groups: []uint32{}, NoSetGroups: false}}
	command.Cancel = func() error {
		if command.Process == nil {
			return os.ErrProcessDone
		}
		return syscall.Kill(-command.Process.Pid, syscall.SIGKILL)
	}
	output := &boundedBuffer{limit: 4096}
	command.Stdout = output
	command.Stderr = &boundedBuffer{limit: 4096}
	command.WaitDelay = time.Second
	if err = command.Run(); err != nil {
		return "", fmt.Errorf("runtime version verification failed: %w", err)
	}
	actual := strings.TrimSpace(output.String())
	if request.Kind == "node" && actual != expected || request.Kind == "go" && !strings.HasPrefix(actual, expected) {
		return "", errors.New("runtime version did not match catalog")
	}
	marker, _ := json.Marshal(map[string]string{"id": request.ID, "kind": request.Kind, "version": request.Version, "sha256": request.SHA256})
	markerFile, err := os.OpenFile(filepath.Join(unpacked, ".zx-panel-install.json"), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0644)
	if err != nil {
		return "", err
	}
	_, err = markerFile.Write(marker)
	closeMarkerErr := markerFile.Close()
	if err == nil {
		err = closeMarkerErr
	}
	if err != nil {
		return "", err
	}
	if _, err = os.Lstat(target); !os.IsNotExist(err) {
		return "", errors.New("installation target already exists")
	}
	if err = ctx.Err(); err != nil {
		return "", err
	}
	if err = os.Rename(unpacked, target); err != nil {
		return "", err
	}
	return target, nil
}

// protectedRoot 验证 root 拥有的提交目录及所有祖先，不允许 web 账号替换父目录。
// 未存在的目录只在其已有祖先全部受保护之后创建。
func protectedRoot(path string) error {
	if !filepath.IsAbs(path) || filepath.Clean(path) == "/" {
		return errors.New("invalid protected directory")
	}
	for current := filepath.Clean(path); ; current = filepath.Dir(current) {
		info, err := os.Lstat(current)
		if err == nil {
			stat, ok := info.Sys().(*syscall.Stat_t)
			if !ok || stat.Uid != 0 || !info.IsDir() || info.Mode().Perm()&0022 != 0 {
				return errors.New("helper directories and ancestors must be root owned and not group/world writable")
			}
		} else if !os.IsNotExist(err) {
			return err
		}
		if current == "/" {
			break
		}
	}
	return os.MkdirAll(path, 0755)
}

// readState 使用固定属性列表核实 systemd 状态与 cgroup 指标。
// 未提供数字的字段保持 null。
func readState(ctx context.Context, id string) (State, error) {
	out, err := fixedCommand(ctx, "/usr/bin/systemctl", "show", "zx-panel-app-"+id+".service", "--property=ActiveState,SubState,MainPID,ExecMainStartTimestamp,CPUUsageNSec,MemoryCurrent", "--no-pager")
	state := State{Status: "unknown"}
	if err != nil {
		return state, err
	}
	values := map[string]string{}
	for _, line := range strings.Split(string(out), "\n") {
		key, value, ok := strings.Cut(line, "=")
		if ok {
			values[key] = value
		}
	}
	switch values["ActiveState"] {
	case "active":
		state.Status = "running"
	case "inactive":
		state.Status = "stopped"
	case "failed":
		state.Status = "failed"
	case "activating":
		state.Status = "starting"
	case "deactivating":
		state.Status = "stopping"
	}
	state.MainPID, _ = strconv.Atoi(values["MainPID"])
	if ns, err := strconv.ParseUint(values["CPUUsageNSec"], 10, 64); err == nil && ns != ^uint64(0) {
		seconds := float64(ns) / 1e9
		state.CPUSeconds = &seconds
	}
	if memory, err := strconv.ParseUint(values["MemoryCurrent"], 10, 64); err == nil && memory != ^uint64(0) {
		state.MemoryBytes = &memory
	}
	if at, err := time.Parse("Mon 2006-01-02 15:04:05 MST", values["ExecMainStartTimestamp"]); err == nil {
		utc := at.UTC()
		state.StartedAt = &utc
	}
	return state, nil
}

// journalArgs 校验固定 journalctl 参数，并避免同时设置互斥的起点选项。
// 带游标时由读取循环检查时间下界和锚点，不能静默跨越轮转缺口。
func journalArgs(request Request) ([]string, error) {
	if request.Limit < 1 || request.Limit > 1000 || len(request.After)+len(request.Before) > 4096 || strings.ContainsAny(request.After+request.Before, "\r\n\x00") {
		return nil, errors.New("invalid journal query")
	}
	if request.After != "" && request.Before != "" {
		return nil, errors.New("conflicting journal cursors")
	}
	args := []string{"--unit=zx-panel-app-" + request.ID + ".service", "--output=json", "--no-pager", "--all", "--output-fields=MESSAGE,PRIORITY,__REALTIME_TIMESTAMP,__CURSOR", "--no-tail"}
	if request.After != "" {
		args = append(args, "--cursor="+request.After)
	}
	if request.After == "" {
		args = append(args, "--reverse")
		if request.Before != "" {
			args = append(args, "--cursor="+request.Before)
		}
	}
	for _, bound := range []struct{ name, value string }{{"--since=", request.From}, {"--until=", request.To}} {
		if bound.value != "" {
			at, err := time.Parse(time.RFC3339Nano, bound.value)
			if err != nil {
				return nil, err
			}
			if bound.name == "--since=" && (request.After != "" || request.Before != "") {
				continue
			}
			args = append(args, bound.name+at.UTC().Format("2006-01-02 15:04:05.000000 UTC"))
		}
	}
	return args, nil
}

// journal 仅查询面板拥有的 unit，并限制范围、记录数与输出体积。
// systemd 游标只作参数值传递，读取第一条时核对锚点仍然存在。
func journal(ctx context.Context, request Request) ([]JournalLine, error) {
	args, err := journalArgs(request)
	if err != nil {
		return nil, err
	}
	from, _ := time.Parse(time.RFC3339Nano, request.From)
	anchor := request.After + request.Before
	anchorPending := anchor != ""
	commandCtx, stop := context.WithCancel(ctx)
	defer stop()
	command := exec.CommandContext(commandCtx, "/usr/bin/journalctl", args...)
	command.Env = []string{"PATH=/usr/bin:/bin", "LANG=C.UTF-8", "LC_ALL=C.UTF-8", "SYSTEMD_PAGER=cat", "SYSTEMD_COLORS=0"}
	command.Stderr = &boundedBuffer{limit: 16 << 10}
	output, err := command.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err = command.Start(); err != nil {
		return nil, err
	}
	defer func() { stop(); _ = output.Close(); _ = command.Wait() }()
	scanner := bufio.NewScanner(output)
	scanner.Buffer(make([]byte, 4096), 1<<20)
	result := []JournalLine{}
	bytesRead := 0
	for scanner.Scan() {
		var row struct {
			Message   json.RawMessage `json:"MESSAGE"`
			Priority  string          `json:"PRIORITY"`
			Timestamp string          `json:"__REALTIME_TIMESTAMP"`
			Cursor    string          `json:"__CURSOR"`
		}
		if err = json.Unmarshal(scanner.Bytes(), &row); err != nil {
			return nil, err
		}
		if anchorPending {
			if row.Cursor != anchor {
				return nil, errors.New("journal cursor no longer available")
			}
			anchorPending = false
			continue
		}
		micros, err := strconv.ParseInt(row.Timestamp, 10, 64)
		if err != nil {
			continue
		}
		at := time.UnixMicro(micros).UTC()
		if !from.IsZero() && at.Before(from) {
			if request.After == "" {
				stop()
				return result, nil
			}
			continue
		}
		message := ""
		if json.Unmarshal(row.Message, &message) != nil {
			var codes []byte
			if json.Unmarshal(row.Message, &codes) != nil {
				continue
			}
			message = string(codes)
		}
		// 完整消息交给主服务先脱敏再截断；helper 批次按总字节提前结束。
		bytesRead += len(message)
		truncated := false
		level := "info"
		if priority, _ := strconv.Atoi(row.Priority); priority <= 3 {
			level = "error"
		} else if priority == 4 {
			level = "warn"
		} else if priority == 7 {
			level = "debug"
		}
		result = append(result, JournalLine{Cursor: row.Cursor, At: at, Message: message, Level: level, Truncated: truncated})
		if len(result) >= request.Limit || bytesRead >= 8<<20 {
			break
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	if anchorPending {
		return nil, errors.New("journal cursor no longer available")
	}
	if len(result) >= request.Limit || bytesRead >= 8<<20 {
		stop()
		return result, nil
	}
	if err := command.Wait(); err != nil {
		return nil, err
	}
	return result, nil
}
