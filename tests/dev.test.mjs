import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import test from "node:test";
import { checkWSL, startDevelopment } from "../scripts/dev.mjs";

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
        assert.equal(args.at(-1), "exec bash scripts/dev-backend.sh");
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
