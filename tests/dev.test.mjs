import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { release } from "node:os";
import { delimiter } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { checkWSL, startDevelopment } from "../scripts/dev/dev.mjs";

test("联合开发命令先校验 WSL，并在失败或中断时清理本轮前后端", async (t) => {
  t.mock.property(process, "platform", "win32");
  const launch = t.mock.method(childProcess, "spawn", () => {
    throw new Error("检查失败时不应启动服务");
  });
  const check = t.mock.method(childProcess, "spawnSync");
  for (const result of [{ error: new Error("ENOENT"), status: null }, { status: 1 }]) {
    check.mock.mockImplementation(() => result);
    assert.throws(checkWSL, /WSL 不可用/);
    await assert.rejects(startDevelopment, /WSL 不可用/);
  }
  let checks = 0;
  check.mock.mockImplementation(() => ({ status: checks++ === 0 ? 0 : 1 }));
  await assert.rejects(startDevelopment, /后端环境检查失败/);
  assert.equal(launch.mock.callCount(), 0);

  check.mock.mockImplementation(() => ({ status: 0 }));
  checkWSL();
  assert.ok(check.mock.calls.at(-1).arguments[1].includes("-lic"));
  for (const scenario of ["backend", "frontend", "error", "SIGINT", "SIGTERM"]) {
    const backend = new EventEmitter();
    const frontend = new EventEmitter();
    let pipeClosed = false;
    let frontendStopped = false;
    backend.stdin = { end() { pipeClosed = true; } };
    frontend.kill = () => { frontendStopped = true; };
    let launches = 0;
    launch.mock.mockImplementation((command, args, options) => {
      if (launches++ === 0) {
        assert.equal(command, "wsl.exe");
        assert.ok(args.includes("-lic"));
        assert.deepEqual(args.slice(-3), ["zx-panel-dev", "scripts/dev/wsl-service.sh", "backend"]);
        assert.equal(options.stdio[0], "pipe");
        return backend;
      }
      assert.equal(command, process.execPath);
      assert.ok(args[0].endsWith("vite.js"));
      assert.equal(options.env.VITE_DATA_MODE, "api");
      return frontend;
    });
    const running = startDevelopment();
    if (scenario === "backend") backend.emit("close", 2);
    else if (scenario === "frontend") frontend.emit("close", 3);
    else if (scenario === "error") {
      t.mock.method(console, "error", () => {});
      backend.emit("error", new Error("WSL 启动失败"));
    } else process.emit(scenario);
    assert.equal(pipeClosed, true);
    assert.equal(frontendStopped, true);
    if (scenario !== "backend") backend.emit("close", 0);
    if (scenario !== "frontend") frontend.emit("close", 0);
    assert.equal(await running, { backend: 2, frontend: 3, error: 1, SIGINT: 130, SIGTERM: 143 }[scenario]);
  }
  assert.equal(process.listenerCount("SIGINT"), 0);
  assert.equal(process.listenerCount("SIGTERM"), 0);
});

test("独立 WSL 命令只启动目标服务，检查失败不启动，并保留退出状态及参数原值", async (t) => {
  for (const platform of ["win32", "linux"]) {
    for (const service of ["frontend", "backend"]) {
      await t.test(`${platform} ${service}`, async (t) => {
        t.mock.property(process, "platform", platform);
        const check = t.mock.method(childProcess, "spawnSync", (command, args) => ({ status: args.at(-1) === "--check" ? 1 : 0 }));
        const launch = t.mock.method(childProcess, "spawn", () => {
          throw new Error("检查失败时不应启动服务");
        });
        await assert.rejects(() => startDevelopment(service), /环境检查失败/);
        assert.equal(launch.mock.callCount(), 0);
        assert.deepEqual(check.mock.calls.at(-1).arguments[1].slice(-3), ["scripts/dev/wsl-service.sh", service, "--check"]);
        check.mock.mockImplementation(() => ({ status: 0 }));
        t.mock.method(console, "error", () => {});
        const args = service === "frontend" ? ["--port", "7203"] : ["--config", "path with spaces/$(literal).json"];
        for (const scenario of ["close", "error", "SIGINT", "SIGTERM"]) {
          const child = new EventEmitter();
          let pipeClosed = false;
          child.stdin = { end() { pipeClosed = true; } };
          launch.mock.mockImplementation((command, commandArgs, options) => {
            assert.equal(command, platform === "win32" ? "wsl.exe" : "bash");
            assert.ok(commandArgs.includes("-lic"));
            assert.ok(commandArgs.includes('exec bash "$@"'));
            assert.deepEqual(commandArgs.slice(-(args.length + 2)), ["scripts/dev/wsl-service.sh", service, ...args]);
            assert.equal(options.stdio[0], "pipe");
            return child;
          });
          const running = startDevelopment(service, args);
          if (scenario === "close") child.emit("close", 2);
          else if (scenario === "error") child.emit("error", new Error("WSL 启动失败"));
          else process.emit(scenario);
          assert.equal(pipeClosed, true);
          if (scenario !== "close") child.emit("close", 0);
          assert.equal(await running, { close: 2, error: 1, SIGINT: 130, SIGTERM: 143 }[scenario]);
        }
        assert.equal(launch.mock.callCount(), 4);
        assert.equal(process.listenerCount("SIGINT"), 0);
        assert.equal(process.listenerCount("SIGTERM"), 0);
      });
    }
  }
});

test("开发命令拒绝未知目标及非 Windows 联合启动", async (t) => {
  const check = t.mock.method(childProcess, "spawnSync", () => { throw new Error("不应检查 WSL"); });
  const launch = t.mock.method(childProcess, "spawn", () => { throw new Error("不应启动服务"); });
  await assert.rejects(() => startDevelopment("unknown"), /开发目标必须/);
  t.mock.property(process, "platform", "linux");
  await assert.rejects(startDevelopment, /需要在 Windows/);
  assert.throws(() => checkWSL("unknown"), /WSL 服务必须/);
  assert.equal(check.mock.callCount(), 0);
  assert.equal(launch.mock.callCount(), 0);
});

test("WSL 命令拒绝不支持的平台", async (t) => {
  t.mock.property(process, "platform", "darwin");
  assert.throws(() => checkWSL("frontend"), /只支持 Windows 或 WSL/);
  await assert.rejects(() => startDevelopment("backend"), /只支持 Windows 或 WSL/);
});

test("普通 Linux 不能通过 WSL 环境检查", { skip: process.platform !== "linux" || /microsoft/i.test(release()) }, () => {
  const result = childProcess.spawnSync("bash", [fileURLToPath(new URL("../scripts/dev/wsl-service.sh", import.meta.url)), "backend", "--check"], { encoding: "utf8", shell: false });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /必须在 WSL 中运行/);
});

test("Bash 检查拒绝 root、非 WSL、错误工具平台及旧版本，检查模式不启动服务", { skip: process.platform !== "linux" }, async () => {
  await mkdir(new URL("../test-results/", import.meta.url), { recursive: true });
  const directory = await mkdtemp(fileURLToPath(new URL("../test-results/dev-wsl-", import.meta.url)));
  try {
    for (const [name, source] of Object.entries({
      grep: '#!/usr/bin/env bash\nexit "${ZX_DEV_TEST_KERNEL_STATUS:-0}"\n',
      id: '#!/usr/bin/env bash\nprintf "%s\\n" "${ZX_DEV_TEST_UID:-1000}"\n',
      node: [
        '#!/usr/bin/env bash',
        '{',
        '  printf "%s\\n" \'Object.defineProperty(process, "platform", { value: process.env.ZX_DEV_TEST_NODE_PLATFORM ?? process.platform }); Object.defineProperty(process.versions, "node", { value: process.env.ZX_DEV_TEST_NODE_VERSION ?? process.versions.node });\'',
        '  cat',
        '} | "$ZX_DEV_TEST_NODE_PATH" "$@"',
        '',
      ].join("\n"),
      go: [
        '#!/usr/bin/env bash',
        'if [[ "$1" != env ]]; then echo "检查模式错误地启动了 Go" >&2; exit 91; fi',
        'case "$2" in',
        '  GOOS) printf "%s\\n%s\\n" "${ZX_DEV_TEST_GOOS:-linux}" "${ZX_DEV_TEST_GOHOSTOS:-linux}" ;;',
        '  GOVERSION) printf "%s\\n" "${ZX_DEV_TEST_GOVERSION:-go1.25.0}" ;;',
        '  *) exit 92 ;;',
        'esac',
        '',
      ].join("\n"),
    })) {
      await writeFile(`${directory}/${name}`, source, { mode: 0o700 });
    }
    /** check 用临时工具模拟环境边界，不启动服务或执行数据库命令。 */
    function check(env = {}, service = "backend") {
      return childProcess.spawnSync("bash", [fileURLToPath(new URL("../scripts/dev/wsl-service.sh", import.meta.url)), service, "--check"], {
        encoding: "utf8", shell: false, env: { ...process.env, PATH: directory + delimiter + process.env.PATH, ZX_DEV_TEST_NODE_PATH: process.execPath, ...env },
      });
    }
    for (const version of ["go1.25.0", "go1.27.1", "go2.0.0"]) {
      const result = check({ ZX_DEV_TEST_GOVERSION: version });
      assert.equal(result.status, 0, result.stderr);
    }
    for (const [env, message, service] of [
      [{ ZX_DEV_TEST_KERNEL_STATUS: "1" }, /必须在 WSL 中运行/],
      [{ ZX_DEV_TEST_UID: "0" }, /不能以 root 运行/],
      [{ ZX_DEV_TEST_GOOS: "windows" }, /需要 Linux Go/],
      [{ ZX_DEV_TEST_GOHOSTOS: "windows" }, /需要 Linux Go/],
      [{ ZX_DEV_TEST_GOVERSION: "go1.24.9" }, /Go 版本过低/],
      [{ ZX_DEV_TEST_GOVERSION: "unknown" }, /无法识别 WSL Go 版本/],
      [{ ZX_DEV_TEST_NODE_PLATFORM: "win32" }, /必须使用 Linux Node.js/, "frontend"],
      [{ ZX_DEV_TEST_NODE_VERSION: "22.21.9" }, /Node.js 版本不满足/, "frontend"],
      [{ ZX_DEV_TEST_NODE_VERSION: "23.1.0" }, /Node.js 版本不满足/, "frontend"],
    ]) {
      const result = check(env, service);
      assert.equal(result.status, 1);
      assert.match(result.stderr, message);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
