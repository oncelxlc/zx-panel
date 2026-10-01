#!/usr/bin/env bash
# 运行独立 WSL 开发服务；管道关闭或服务退出时清理本轮进程组。
set -euo pipefail

# fail 在启动服务前报告缺失条件，以非零状态退出。
fail() { printf '%s\n' "$*" >&2; exit 1; }

case "${1:-}" in
  frontend|backend) service=$1; shift ;;
  *) fail 'Usage: wsl-service.sh frontend|backend [--check|service arguments]' ;;
esac
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." || fail '无法进入共享仓库目录。'
[[ -r /proc/sys/kernel/osrelease ]] && grep -qi microsoft /proc/sys/kernel/osrelease || fail '该命令必须在 WSL 中运行，普通 Linux 环境不受支持。'
[[ "$(id -u)" -ne 0 ]] || fail 'WSL 开发服务不能以 root 运行，请使用非 root 用户。'
command -v setsid >/dev/null || fail 'WSL 中找不到 setsid，请安装 util-linux。'
[[ -f package.json && -f go.mod ]] || fail 'WSL 无法访问完整仓库，请检查共享仓库路径。'

if [[ "$service" == frontend ]]; then
  command -v node >/dev/null || fail 'WSL 中找不到 Node.js，请安装 Linux Node.js 并加入 Bash 的 PATH。'
  node --input-type=module <<'NODE'
import { createRequire } from "node:module";
/** fail 报告 Node 平台、版本或原生依赖不满足开发条件。 */
function fail(message) { console.error(message); process.exit(1); }
const [major, minor] = process.versions.node.split(".").map(Number);
if (process.platform !== "linux") fail("WSL 前端必须使用 Linux Node.js，不能使用 Windows node.exe。");
if (!(major >= 24 || (major === 22 && minor >= 22))) fail("WSL Node.js 版本不满足 package.json：需要 ^22.22.0 或 >=24.0.0。");
try {
  await import("vite");
  const require = createRequire(import.meta.url);
  createRequire(require.resolve("vite"))("esbuild").transformSync("");
} catch (error) {
  fail(`WSL 前端依赖检查失败：${(error.cause?.message ?? error.message).split("\n")[0]}。请在 WSL 中用 Linux pnpm 执行 pnpm install --frozen-lockfile；Windows 与 WSL 应使用各自的 node_modules。`);
}
NODE
  export VITE_DATA_MODE=api
  command=(node node_modules/vite/bin/vite.js "$@")
else
  command -v go >/dev/null || fail 'WSL 中找不到 Go，请安装并加入 Bash 的 PATH。'
  [[ "$(GOTOOLCHAIN=local go env GOOS GOHOSTOS)" == $'linux\nlinux' ]] || fail 'WSL 后端需要 Linux Go，且 GOOS 必须为 linux。'
  go_version=$(GOTOOLCHAIN=local go env GOVERSION)
  [[ "$go_version" =~ ^go([0-9]+)\.([0-9]+) ]] || fail '无法识别 WSL Go 版本，请使用 Go 1.25 或更高版本。'
  (( BASH_REMATCH[1] > 1 || (BASH_REMATCH[1] == 1 && BASH_REMATCH[2] >= 25) )) || fail 'WSL Go 版本过低，请安装 Go 1.25 或更高版本。'
  # 可选本机开发配置使数据和密钥位于 Linux 文件系统，避免 Windows 挂载盘权限失真。
  backend_args=()
  if [[ -f configs/dev.json ]]; then
    backend_args=(--config configs/dev.json)
  fi
  command=(go run -tags devassets ./cmd/server "${backend_args[@]}" "$@")
fi
[[ "${1:-}" == --check ]] && exit 0

setsid "${command[@]}" &
service_pid=$!
# 父进程持有 stdin；EOF 表示它已退出或要求停止服务。
cat <&0 >/dev/null &
watcher=$!

# cleanup 给服务现有的 35 秒排空留出时间，再终止仍未退出的本轮进程。
cleanup() {
  kill "$watcher" 2>/dev/null || true
  kill -TERM -- "-$service_pid" 2>/dev/null || true
  local deadline=$((SECONDS + 40))
  while kill -0 -- "-$service_pid" 2>/dev/null; do
    if (( SECONDS >= deadline )); then
      kill -KILL -- "-$service_pid" 2>/dev/null || true
      break
    fi
    sleep 0.1
  done
  wait "$service_pid" "$watcher" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
wait -n "$service_pid" "$watcher"
exit $?
