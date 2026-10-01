import childProcess from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** root 让本机与 WSL 服务共用仓库目录及开发配置。 */
const root = fileURLToPath(new URL("../../", import.meta.url));

/** wslCommand 用位置参数传递服务参数，避免 Bash 解释路径或用户参数。 */
function wslCommand(service, args) {
  const bash = ["bash", "-lic", 'exec bash "$@"', "zx-panel-dev", "scripts/dev/wsl-service.sh", service, ...args];
  return process.platform === "win32"
    ? { command: "wsl.exe", args: ["--cd", root, "--exec", ...bash] }
    : { command: "bash", args: bash.slice(1) };
}

/** checkWSL 只检查即将启动的服务；Windows 使用默认发行版，Linux 必须属于 WSL。 */
export function checkWSL(service = "backend") {
  if (process.platform !== "win32" && process.platform !== "linux") {
    throw new Error("WSL 开发命令只支持 Windows 或 WSL 内的 Linux 环境。");
  }
  if (service !== "frontend" && service !== "backend") {
    throw new Error("WSL 服务必须是 frontend 或 backend。");
  }
  const options = { cwd: root, stdio: "inherit", shell: false, windowsHide: true, timeout: 30000 };
  if (process.platform === "win32") {
    const wsl = childProcess.spawnSync("wsl.exe", ["--exec", "true"], options);
    if (wsl.error || wsl.status !== 0) {
      throw new Error("WSL 不可用：请先安装 WSL 和 Linux 发行版，并确认 wsl --exec true 能成功执行。");
    }
  }
  const invocation = wslCommand(service, ["--check"]);
  const tools = childProcess.spawnSync(invocation.command, invocation.args, options);
  if (tools.error || tools.status !== 0) {
    throw new Error(`WSL ${service === "frontend" ? "前端" : "后端"}环境检查失败，服务未启动。请按上方提示检查工具、用户及仓库依赖。`);
  }
}

/** startDevelopment 启动联合开发或独立 WSL 服务，退出时只清理本轮进程。 */
export async function startDevelopment(target = "all", args = []) {
  if (!["all", "frontend", "backend"].includes(target)) {
    throw new Error("开发目标必须是 all、frontend 或 backend。");
  }
  if (target === "all" && process.platform !== "win32") {
    throw new Error("pnpm dev:all 需要在 Windows 中运行，并通过 WSL 启动 Go 后端。");
  }
  checkWSL(target === "all" ? "backend" : target);
  const invocation = wslCommand(target === "all" ? "backend" : target, target === "all" ? [] : args);
  const children = [childProcess.spawn(invocation.command, invocation.args, {
    cwd: root, stdio: ["pipe", "inherit", "inherit"], shell: false, windowsHide: true,
  })];
  if (target === "all") {
    children.push(childProcess.spawn(process.execPath, [resolve(root, "node_modules/vite/bin/vite.js"), ...args], {
      cwd: root, env: { ...process.env, VITE_DATA_MODE: "api" }, stdio: "inherit", shell: false, windowsHide: true,
    }));
  }
  return new Promise((resolveExit) => {
    let stopping = false;
    let remaining = children.length;
    let exitCode = 0;
    /** stop 关闭 WSL 生命周期管道，由 Linux 脚本排空并终止服务进程组。 */
    function stop(code) {
      if (stopping) return;
      stopping = true;
      exitCode = code;
      for (const child of children) {
        if (child.stdin) child.stdin.end();
        else child.kill();
      }
    }
    /** interrupt 将交互式退出统一交给本轮子进程清理。 */
    const interrupt = () => stop(130);
    /** terminate 保留 SIGTERM 的退出状态并执行相同清理。 */
    const terminate = () => stop(143);
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", terminate);
    for (const child of children) {
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await startDevelopment(process.argv[2] ?? "all", process.argv.slice(3));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
