import childProcess from "node:child_process";
import { resolve } from "node:path";

/** root 让 Windows Vite 与 WSL Go 共用仓库目录及开发配置。 */
const root = resolve(import.meta.dirname, "..");

/** checkWSL 在启动任一服务前确认 WSL、默认发行版及后端运行条件。 */
export function checkWSL() {
  if (process.platform !== "win32") {
    throw new Error("pnpm dev:all 需要在 Windows 中运行，并通过 WSL 启动 Go 后端。");
  }
  const options = { cwd: root, stdio: "inherit", shell: false, windowsHide: true, timeout: 30000 };
  const wsl = childProcess.spawnSync("wsl.exe", ["--exec", "true"], options);
  if (wsl.error || wsl.status !== 0) {
    throw new Error("WSL 不可用：请先安装 WSL 和 Linux 发行版，并确认 wsl --exec true 能成功执行。");
  }
  const tools = childProcess.spawnSync("wsl.exe", ["--cd", root, "--exec", "bash", "-lc", String.raw`
    command -v go >/dev/null || { echo 'WSL 中找不到 Go，请安装并加入登录 shell 的 PATH。' >&2; exit 1; }
    command -v setsid >/dev/null || { echo 'WSL 中找不到 setsid，请安装 util-linux。' >&2; exit 1; }
    test "$(id -u)" -ne 0 || { echo 'Go 后端不能以 root 运行，请配置 WSL 的默认非 root 用户。' >&2; exit 1; }
    test -f go.mod && test -f scripts/dev-backend.sh
  `], options);
  if (tools.error || tools.status !== 0) {
    throw new Error("WSL 后端环境检查失败，前后端均未启动。请检查 Go、用户及仓库路径。");
  }
}

/** startDevelopment 同时启动真实 API 与 Vite，任一退出或收到信号时停止本轮进程。 */
export async function startDevelopment() {
  checkWSL();
  const backend = childProcess.spawn("wsl.exe", ["--cd", root, "--exec", "bash", "-lc", "exec bash scripts/dev-backend.sh"], {
    cwd: root, stdio: ["pipe", "inherit", "inherit"], shell: false, windowsHide: true,
  });
  const frontend = childProcess.spawn(process.execPath, [resolve(root, "node_modules/vite/bin/vite.js"), ...process.argv.slice(2)], {
    cwd: root, env: { ...process.env, VITE_DATA_MODE: "api" }, stdio: "inherit", shell: false, windowsHide: true,
  });
  return new Promise((resolveExit) => {
    let stopping = false;
    let remaining = 2;
    let exitCode = 0;
    /** stop 关闭 WSL 的生命周期管道，由 Linux 脚本排空并终止 Go 进程组。 */
    function stop(code) {
      if (stopping) return;
      stopping = true;
      exitCode = code;
      backend.stdin?.end();
      frontend.kill();
    }
    /** interrupt 将交互式退出统一交给本轮子进程清理。 */
    const interrupt = () => stop(130);
    /** terminate 保留 SIGTERM 的退出状态并执行相同清理。 */
    const terminate = () => stop(143);
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", terminate);
    for (const child of [backend, frontend]) {
      child.once("error", (error) => {
        console.error(error.message);
        stop(1);
      });
      child.once("close", (code) => {
        stop(code ?? 1);
        if (--remaining === 0) {
          process.removeListener("SIGINT", interrupt);
          process.removeListener("SIGTERM", terminate);
          resolveExit(exitCode);
        }
      });
    }
  });
}

if (import.meta.main) {
  try {
    process.exitCode = await startDevelopment();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
