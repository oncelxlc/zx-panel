import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test("real setup, Cookie login, API dashboard, export and password revocation", async ({
  page,
  context,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "初始化 zx-panel" }),
  ).toBeVisible();
  await page
    .getByLabel("一次性初始化凭据", { exact: true })
    .fill("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  await page.getByLabel("管理员账号", { exact: true }).fill("browser.admin");
  await page
    .getByLabel("密码", { exact: true })
    .fill("BrowserFixtureOnly-123!");
  await page
    .getByLabel("确认密码", { exact: true })
    .fill("BrowserFixtureOnly-123!");
  await page.getByRole("button", { name: "创建管理员" }).click();
  await expect(page.getByRole("heading", { name: "欢迎回来" })).toBeVisible();
  await page.getByLabel("账号", { exact: true }).fill("browser.admin");
  await page
    .getByLabel("密码", { exact: true })
    .fill("BrowserFixtureOnly-123!");
  await page.getByRole("button", { name: "登录控制台" }).click();
  await expect(
    page.getByRole("heading", { name: "概览", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("status", { name: "正在加载" })).toHaveCount(0);
  await expect(
    page.getByText("演示数据 · 当前操作不会影响真实服务器"),
  ).toHaveCount(0);
  const cookie = (await context.cookies()).find(
    (value) => value.name === "zx-panel-session",
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Strict");
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  const latency = await page.evaluate(async () => {
    const samples: number[] = [];
    for (let i = 0; i < 30; i++) {
      const started = performance.now();
      const response = await fetch("/api/v1/metrics/latest");
      if (!response.ok) throw new Error("benchmark read failed");
      await response.json();
      samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    return {
      samples: 30,
      p50Ms: samples[14],
      p95Ms: samples[28],
      scope:
        "Windows loopback API fixture; no Linux/systemd or sustained-load claim",
    };
  });
  await writeFile(
    testInfo.outputPath("performance.json"),
    JSON.stringify(latency, null, 2),
  );
  const tab = await context.newPage();
  await tab.goto("/overview");
  await expect(
    tab.getByRole("heading", { name: "概览", exact: true }),
  ).toBeVisible();
  await page.goto("/logs");
  await expect(page.getByRole("status", { name: "正在加载" })).toHaveCount(0);
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await expect(page.getByText("已完成", { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载日志（10 分钟内有效）" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("zx-panel-logs.txt");
  await page.goto("/settings");
  await page
    .getByLabel("当前密码", { exact: true })
    .fill("BrowserFixtureOnly-123!");
  await page
    .getByLabel("新密码", { exact: true })
    .fill("BrowserFixtureChanged-123!");
  await page
    .getByLabel("确认新密码", { exact: true })
    .fill("BrowserFixtureChanged-123!");
  await page.getByRole("button", { name: "修改密码并撤销旧会话" }).click();
  await expect(page.getByRole("heading", { name: "欢迎回来" })).toBeVisible();
  await expect(tab.getByRole("heading", { name: "欢迎回来" })).toBeVisible();
  expect(errors).toEqual([]);
});
