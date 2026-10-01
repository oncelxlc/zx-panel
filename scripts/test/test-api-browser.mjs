import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

/** fixture 只启动显式隔离 Go 测试，随机库由测试本身验证并清理。 */
const fixture = spawn(
  "go",
  ["test", "./internal/api", "-run", "^TestBrowserFixture$", "-count=1", "-v"],
  {
    env: {
      ...process.env,
      ZX_PANEL_INTEGRATION: "1",
      ZX_PANEL_BROWSER_FIXTURE: "1",
    },
    stdio: "inherit",
    shell: false,
  },
);
const exited = new Promise((resolve, reject) => {
  fixture.on("error", reject);
  fixture.on("exit", (code) => resolve(code));
});
let failure;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (fixture.exitCode !== null)
      throw new Error("Go browser fixture exited before startup");
    try {
      const response = await fetch("http://127.0.0.1:7202/api/v1/setup/status");
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* 仅等待本轮创建的回环服务。 */
    }
    await delay(1000);
  }
  if (!ready) throw new Error("Go browser fixture did not become ready");
  const tests = spawn(
    process.execPath,
    [
      "node_modules/@playwright/test/cli.js",
      "test",
      "--config",
      "playwright.api.config.ts",
    ],
    { stdio: "inherit", shell: false },
  );
  const status = await new Promise((resolve, reject) => {
    tests.on("error", reject);
    tests.on("exit", resolve);
  });
  if (status !== 0) throw new Error("Real API browser test failed");
} catch (error) {
  failure = error;
} finally {
  try {
    await fetch("http://127.0.0.1:7202/__test/finish", {
      method: "POST",
      headers: { Origin: "http://127.0.0.1:7202" },
    });
  } catch {
    /* 夹具未启动时等待其自身终止并清理。 */
  }
  const code = await exited;
  if (code !== 0 && !failure)
    failure = new Error("Isolated fixture cleanup failed");
}
if (failure) throw failure;
