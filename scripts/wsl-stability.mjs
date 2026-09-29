import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

/** wsl 仅访问本任务实验资源；代理断线实验只操作独立 lab 单元。 */
function wsl(args) {
  const result = spawnSync("wsl.exe", ["-d", "Ubuntu-24.04", "-u", "root", "--", ...args], { encoding: "utf8", shell: false });
  if (result.status !== 0) throw new Error("WSL lab command failed");
  return result.stdout;
}
const minutes = Number(process.argv[2] ?? 30);
if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) throw new Error("Duration must be 1–60 minutes");
const origin = "https://127.0.0.1:27443";
const identity = JSON.parse(wsl(["cat", "/etc/zx-panel-lab/credentials.json"]));
const acceptance = JSON.parse(wsl(["cat", "/opt/zx-panel-lab/reports/acceptance.json"]));
const directory = process.argv[3] ?? "test-results/wsl-stability";
if (!/^test-results\/[a-z0-9-]+$/.test(directory)) throw new Error("Report directory must stay inside test-results");
await mkdir(directory, { recursive: true });
const report = { environment: "Chromium on Windows → Nginx HTTPS → Ubuntu 24.04 WSL2 x86_64", requestedMinutes: minutes, logProducerLinesPerSecond: 100, samples: [], pageErrors: [], apiFailures: {}, scope: "1/5/10 independent Chromium contexts share one administrator session; server stream limits remain enforced." };
const browser = await chromium.launch({ headless: true });
const clients = [];
let stage = "login";
let interrupted = false;
process.on("SIGINT", () => { interrupted = true; });
try {
  const first = await browser.newContext({ ignoreHTTPSErrors: true, reducedMotion: "reduce", viewport: { width: 1440, height: 1000 } });
  const page = await first.newPage();
  const diagnostics = await first.newCDPSession(page);
  await diagnostics.send("Performance.enable");
  await page.goto(origin + "/login");
  await page.getByRole("heading", { name: "欢迎回来" }).waitFor();
  await page.getByLabel("账号", { exact: true }).fill(identity.username);
  await page.getByLabel("密码", { exact: true }).fill(identity.password);
  await page.getByRole("button", { name: "登录控制台" }).click();
  await page.getByRole("heading", { name: "概览", exact: true }).waitFor();
  await page.getByRole("application").waitFor();
  const cookies = await first.cookies();
  const auth = cookies.find((cookie) => cookie.name === "__Host-zx-panel-session");
  if (!auth?.httpOnly || !auth.secure || auth.sameSite !== "Strict") throw new Error("Production Cookie policy failed");
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => localStorage.setItem("zx-panel-theme", value), theme);
    await page.reload();
    await page.getByRole("application").waitFor();
    await page.screenshot({ path: `${directory}/overview-${theme}.png`, fullPage: true });
  }
  clients.push({ context: first, page });
  const observe = (client) => {
    client.page.on("pageerror", (error) => report.pageErrors.push(error.message));
    client.page.on("response", (response) => {
      if (response.url().includes("/api/") && response.status() >= 400) {
        const key = response.status() + " " + new URL(response.url()).pathname;
        report.apiFailures[key] = (report.apiFailures[key] ?? 0) + 1;
      }
    });
  };
  observe(clients[0]);
  await page.goto(origin + "/logs?source=" + encodeURIComponent("app:" + acceptance.appId));
  await page.getByRole("heading", { name: "日志", exact: true }).waitFor();
  stage = "sampling";
  const started = Date.now();
  const duration = minutes * 60_000;
  report.startedAt = new Date(started).toISOString();
  let nextSample = started;
  while (!interrupted && Date.now() - started < duration) {
    const elapsed = Date.now() - started;
    const wanted = elapsed < duration / 3 ? 1 : elapsed < duration * 2 / 3 ? 5 : 10;
    while (clients.length < wanted) {
      const context = await browser.newContext({ ignoreHTTPSErrors: true, reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });
      await context.addCookies(cookies);
      const client = { context, page: await context.newPage() };
      observe(client);
      await client.page.goto(origin + "/overview");
      await client.page.getByRole("heading", { name: "概览", exact: true }).waitFor();
      clients.push(client);
    }
    if (Date.now() >= nextSample) {
      const server = JSON.parse(wsl(["python3", "/mnt/e/Github/zx-panel/scripts/wsl-lab.py", "sample"]));
      const latency = await page.evaluate(async () => {
        const times = [];
        for (let i = 0; i < 10; i++) {
          const before = performance.now();
          const response = await fetch("/api/v1/metrics/latest");
          if (!response.ok) throw new Error("Metrics read failed");
          await response.json();
          times.push(performance.now() - before);
        }
        return times;
      });
      const logState = await page.evaluate(() => {
        const { document, performance } = globalThis;
        return {
        renderedRows: document.querySelectorAll('[aria-label="日志纯文本，可选择复制"] .absolute').length,
        bufferedText: [...document.querySelectorAll("span")].find((element) => /条显示$/.test(element.textContent ?? ""))?.textContent ?? "",
        droppedText: document.body.textContent?.match(/缓冲已裁剪 \d+ 条记录/)?.[0] ?? "",
        heapBytes: performance.memory?.usedJSHeapSize ?? null,
        };
      });
      const { metrics } = await diagnostics.send("Performance.getMetrics");
      logState.cdpHeapBytes = metrics.find((metric) => metric.name === "JSHeapUsedSize")?.value ?? null;
      report.samples.push({ elapsedSeconds: Math.round(elapsed / 1000), clients: clients.length, latencyMs: latency, logState, ...server });
      await writeFile(`${directory}/stability.json`, JSON.stringify(report, null, 2));
      if (elapsed > 120_000 && (logState.bufferedText !== "5000 条显示" || !logState.droppedText || logState.renderedRows < 1 || logState.renderedRows > 100)) {
        stage = "log-buffer-growth-and-bound";
        throw new Error("Live log growth and virtualization did not meet bounds");
      }
      console.log(`WSL stability ${Math.round(elapsed / 60_000)}/${minutes} min; clients=${clients.length}; RSS=${server["zx-panel-lab"].rssKiB} KiB; goroutines=${server.goroutines}; ${logState.bufferedText}`);
      nextSample = Date.now() + 60_000;
    }
    await delay(1000);
  }
  await page.screenshot({ path: `${directory}/logs-after-load.png`, fullPage: true });
  report.finishedAt = new Date().toISOString();
  report.elapsedSeconds = Math.round((Date.now() - started) / 1000);
  const latency = report.samples.flatMap((sample) => sample.latencyMs).sort((a, b) => a - b);
  report.p95Ms = latency[Math.floor(latency.length * 0.95)];
  if (interrupted) throw new Error("Experiment interrupted");
  if (report.pageErrors.length) throw new Error("Browser runtime errors occurred");
  if (report.samples.some((sample) => sample.logState.renderedRows > 100)) throw new Error("Log virtualization bound exceeded");
  stage = "log-pause";
  const rows = page.getByRole("region", { name: "日志纯文本，可选择复制" }).locator(".absolute");
  await page.getByRole("button", { name: "暂停显示", exact: true }).click();
  await page.getByRole("button", { name: "恢复显示", exact: true }).waitFor();
  const frozen = await rows.last().innerText();
  await delay(2500);
  if (await rows.last().innerText() !== frozen) throw new Error("Paused logs moved");
  await page.getByText(/^新增 \d+ 条$/).waitFor();
  stage = "log-resume";
  await page.getByRole("button", { name: "恢复显示", exact: true }).click();
  await delay(2500);
  if (await rows.last().innerText() === frozen) throw new Error("Logs did not resume");
  stage = "log-offline";
  wsl(["systemctl", "stop", "zx-panel-lab-nginx.service"]);
  try {
    await page.getByText("日志连接中断，正在重连；保留最后记录。", { exact: true }).waitFor({ timeout: 20000 });
  } finally {
    wsl(["systemctl", "start", "zx-panel-lab-nginx.service"]);
  }
  stage = "log-reconnect";
  await page.getByText("日志连接中断，正在重连；保留最后记录。", { exact: true }).waitFor({ state: "hidden", timeout: 20000 });
  stage = "log-empty-filter";
  await page.getByLabel("搜索日志", { exact: true }).fill("zx-lab-no-matching-line");
  await page.getByText("0 条显示", { exact: true }).waitFor();
  stage = "log-matching-filter";
  await page.getByLabel("搜索日志", { exact: true }).fill("lab-heartbeat");
  await rows.first().waitFor();
  if (!(await rows.last().innerText()).includes("lab-heartbeat")) throw new Error("Log filter mismatch");
  await page.screenshot({ path: `${directory}/logs-after-interactions.png`, fullPage: true });
  report.logInteractions = ["pause preserves visible tail", "resume advances tail", "offline reconnect", "text filtering"];
  report.status = "passed";
} catch {
  report.status = "failed";
  report.failedStage = stage;
  process.exitCode = 1;
  console.error(`WSL browser stability failed at ${stage}; no credentials recorded.`);
  if (stage.startsWith("log-") && clients[0]) await clients[0].page.screenshot({ path: `${directory}/failed-interaction.png`, fullPage: true }).catch(() => {});
} finally {
  await writeFile(`${directory}/stability.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
