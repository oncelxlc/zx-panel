import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

/** 此报告只读取专用 WSL 凭据到内存，永不输出 Cookie 或密码。 */
const credentials = spawnSync("wsl.exe", ["-d", "Ubuntu-24.04", "-u", "root", "--", "cat", "/etc/zx-panel-lab/credentials.json"], { encoding: "utf8", shell: false });
if (credentials.status !== 0) throw new Error("Lab credentials unavailable");
const identity = JSON.parse(credentials.stdout);
const suffix = process.argv[2] ?? "current";
if (!/^[a-z-]+$/.test(suffix)) throw new Error("Invalid report label");
const origin = "https://127.0.0.1:27443";
const browser = await chromium.launch({ headless: true });
try {
  const login = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await login.newPage();
  await page.goto(origin + "/login");
  await page.getByLabel("账号", { exact: true }).fill(identity.username);
  await page.getByLabel("密码", { exact: true }).fill(identity.password);
  await page.getByRole("button", { name: "登录控制台" }).click();
  await page.getByRole("heading", { name: "概览", exact: true }).waitFor();
  const context = await browser.newContext({ ignoreHTTPSErrors: true, reducedMotion: "reduce" });
  await context.addCookies(await login.cookies());
  await login.close();
  const cold = await context.newPage();
  const protocol = await context.newCDPSession(cold);
  await protocol.send("Network.enable");
  await protocol.send("Network.setCacheDisabled", { cacheDisabled: true });
  const responses = new Map();
  const failures = [];
  cold.on("pageerror", (error) => failures.push(error.message));
  cold.on("response", (response) => {
    if (response.url().startsWith(origin)) responses.set(new URL(response.url()).pathname, { status: response.status(), encoding: response.headers()["content-encoding"] ?? "identity", type: response.headers()["content-type"] ?? "" });
  });
  await cold.goto(origin + "/overview");
  await cold.getByRole("heading", { name: "概览", exact: true }).waitFor();
  await cold.getByRole("application").waitFor({ timeout: 30000 });
  await cold.waitForTimeout(1000);
  const entries = await cold.evaluate(() => performance.getEntriesByType("resource").map((item) => ({ path: new URL(item.name).pathname, initiator: item.initiatorType, encoded: item.encodedBodySize, decoded: item.decodedBodySize, transfer: item.transferSize, startedMs: item.startTime, durationMs: item.duration })));
  const js = entries.filter((item) => item.path.endsWith(".js")).map((item) => ({ ...item, ...responses.get(item.path) }));
  assert(js.length > 0 && js.every((item) => item.status === 200 && item.encoded > 0));
  assert(!js.some((item) => /mockserviceworker|fixtures|handlers/i.test(item.path)));
  const deferred = js.filter((item) => /ResourceChart-|Logs-/.test(item.path));
  const initial = js.filter((item) => !deferred.includes(item));
  const bytes = (items) => items.reduce((sum, item) => sum + item.encoded, 0);
  const apiResponses = [...responses].filter(([path]) => path.startsWith("/api/")).map(([path, info]) => ({ path, ...info }));
  assert(apiResponses.some((item) => item.type === "text/event-stream"));
  assert(apiResponses.every((item) => item.encoding === "identity"));
  const report = { environment: "Cold Chromium context → WSL x86_64 Nginx TLS → embedded API frontend", scope: "Authenticated overview with cache disabled; ResourceChart/Logs chunks recorded separately, also included in full overview total.", initialJSBytes: bytes(initial), deferredJSBytes: bytes(deferred), completeOverviewJSBytes: bytes(js), initialBudgetBytes: 300 * 1024, initialBudgetPassed: bytes(initial) <= 300 * 1024, js, apiResponses, pageErrors: failures };
  assert.equal(failures.length, 0);
  await mkdir("test-results/resource-budget", { recursive: true });
  await writeFile(`test-results/resource-budget/${suffix}.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ initialJSBytes: report.initialJSBytes, deferredJSBytes: report.deferredJSBytes, completeOverviewJSBytes: report.completeOverviewJSBytes, initialBudgetPassed: report.initialBudgetPassed, encodings: [...new Set(js.map((item) => item.encoding))] }));
} finally {
  await browser.close();
}
