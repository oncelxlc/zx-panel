import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { capabilitiesSchema } from "@/lib/api/schemas";

/** 隔离夹具禁用真实 helper；按实际平台验证权限提示后继续只读浏览。 */
async function browseWithoutHelper(page: Page) {
  const response = await page.request.get("/api/v1/system/capabilities");
  expect(response.ok()).toBe(true);
  const capability = capabilitiesSchema.parse((await response.json()).data).installRuntime;
  expect(capability.enabled).toBe(false);
  expect(["HELPER_DISABLED", "UNSUPPORTED_PLATFORM", "UNSUPPORTED_ENVIRONMENT"]).toContain(capability.reasonCode);
  if (capability.reasonCode === "HELPER_DISABLED") {
    const notice = page.getByRole("alertdialog", { name: "需要启用管理权限" });
    await expect(notice).toBeVisible();
    await notice.getByRole("button", { name: "暂时浏览", exact: true }).click();
    await expect(notice).toHaveCount(0);
  }
}

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
  await expect(page).toHaveURL(/\/overview$/);
  await browseWithoutHelper(page);
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
        "Loopback API fixture; no systemd lifecycle or sustained-load claim",
    };
  });
  await writeFile(
    testInfo.outputPath("performance.json"),
    JSON.stringify(latency, null, 2),
  );
  const tab = await context.newPage();
  await tab.goto("/overview");
  await browseWithoutHelper(tab);
  await expect(
    tab.getByRole("heading", { name: "概览", exact: true }),
  ).toBeVisible();
  await page.goto("/logs");
  await browseWithoutHelper(page);
  await expect(page.getByRole("status", { name: "正在加载" })).toHaveCount(0);
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await expect(page.getByText("已完成", { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载日志（10 分钟内有效）" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("zx-panel-logs.txt");
  await page.goto("/settings");
  await browseWithoutHelper(page);
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
