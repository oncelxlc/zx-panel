import { expect, test } from "@playwright/test";

// 动效回归必须覆盖正常速度；其他功能测试仍沿用减少动态效果配置。
test.use({ reducedMotion: "no-preference" });

test("sidebar reveals labels after expansion and keeps icons and row heights stable", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/overview");
  await expect(page.getByRole("application").first()).toBeVisible();
  const trigger = page.getByRole("button", { name: "切换导航", exact: true });
  const link = page.getByRole("link", { name: "运行时", exact: true });
  const label = link.locator(".sidebar-label");
  const icon = link.locator("svg");
  const initialIcon = await icon.boundingBox();
  const initialRow = await link.boundingBox();
  await trigger.click();
  await expect(page.locator('[data-slot="sidebar-container"]')).toHaveCSS("width", "64px");
  await expect(label).toHaveCSS("opacity", "0");
  expect((await link.boundingBox())?.height).toBe(initialRow?.height);
  expect((await icon.boundingBox())?.x).toBe(initialIcon?.x);
  await trigger.evaluate((button: HTMLButtonElement) => button.click());
  const contentWidth = await page.locator('[data-slot="sidebar-inset"]').evaluate((element) => element.clientWidth);
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    for (const animation of document.getAnimations()) {
      const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
      if (target?.closest('[data-slot="sidebar"]') || target?.matches('[data-slot="sidebar-inset"]')) {
        animation.pause();
        animation.currentTime = 50;
      }
    }
  });
  await expect(label).toHaveCSS("opacity", "0");
  expect((await link.boundingBox())?.height).toBe(initialRow?.height);
  expect(await page.locator('[data-slot="sidebar-inset"]').evaluate((element) => element.clientWidth)).toBe(contentWidth);
  const chart = page.locator('[data-slot="chart"]');
  expect((await chart.locator("svg.recharts-surface").boundingBox())?.width ?? Infinity)
    .toBeLessThanOrEqual(((await chart.boundingBox())?.width ?? 0) + 1);
  await page.screenshot({ path: testInfo.outputPath("sidebar-expanding.png") });
  await page.evaluate(() => document.getAnimations().forEach((animation) => {
    if (animation.playState === "paused") animation.finish();
  }));
  await expect(label).toHaveCSS("opacity", "1");
  for (let index = 0; index < 6; index++) {
    await trigger.evaluate((button: HTMLButtonElement) => button.click());
    await page.waitForTimeout(35);
  }
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(label).toHaveCSS("opacity", "1");
  await expect(page.locator('[data-slot="sidebar-container"]')).toHaveCSS("width", "224px");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await trigger.click();
  await expect(label).toHaveCSS("transition-delay", "0s");
  await expect(label).toHaveCSS("opacity", "0");
});

test("closing task and reference sheets keep their content throughout the exit", async ({ page }, testInfo) => {
  await page.goto("/overview?task=task-verify");
  await expect(page.getByRole("button", { name: "返回任务列表", exact: true })).toBeVisible();
  await expect(page.getByText("归档校验失败，未进入安装提交阶段", { exact: true })).toBeVisible();
  for (const kind of ["task", "references"]) {
    if (kind === "references") {
      await page.goto("/runtimes/node");
      await page.getByRole("button", { name: /个应用 · 查看引用/ }).first().click();
      await expect(page.getByText("扫描已完成", { exact: true })).toBeVisible();
    }
    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(sheet).toHaveCSS("opacity", "1");
    await page.getByRole("button", { name: "关闭", exact: true }).evaluate((button: HTMLButtonElement) => button.click());
    await page.waitForSelector('[data-slot="sheet-content"][data-ending-style]', { state: "attached" });
    await sheet.evaluate((element) => {
      for (const animation of element.getAnimations()) { animation.pause(); animation.currentTime = 50; }
    });
    await expect(sheet).toContainText(kind === "task" ? "返回任务列表" : "扫描已完成");
    await expect(sheet.locator('[data-slot="skeleton"]')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`${kind}-closing.png`) });
    await sheet.evaluate((element) => element.getAnimations().forEach((animation) => animation.finish()));
    await expect(sheet).toHaveCount(0);
  }
});

test("slow or failed decorative images do not block or move the login form", async ({ page, context }, testInfo) => {
  await page.emulateMedia({ colorScheme: "light" });
  let release = () => {};
  const ready = new Promise<void>((resolve) => { release = resolve; });
  // MSW 会透传图片请求，Context 同时拦截页面和 Service Worker 发出的请求。
  await context.route("**/login/login-bg-light.png", async (route) => {
    await ready;
    await route.continue();
  });
  try {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    const input = page.getByRole("textbox", { name: "账号", exact: true });
    await expect(input).toBeVisible();
    await expect(page.locator(".login-page__image")).toHaveCount(0);
    await input.fill("demo");
    const before = await input.boundingBox();
    release();
    await expect(page.locator(".login-page__image")).toHaveCSS("opacity", "1");
    expect(await input.boundingBox()).toEqual(before);
    await page.screenshot({ path: testInfo.outputPath("login-loaded.png") });
    await context.route("**/login/login-bg-dart.png", (route) => route.abort());
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(input).toHaveValue("demo");
    await expect(page.locator(".login-page__image")).toHaveAttribute("src", "/login/login-bg-light.png");
  } finally {
    release();
  }
});

test("stacked notifications reveal text after moving and popups tolerate rapid reversal", async ({ page }, testInfo) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "设置", exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const modulePath = "/src/lib/toast.ts";
    const { toast } = await import(modulePath);
    for (let index = 0; index < 4; index++) toast.add({ title: `动效检查 ${index}`, timeout: 0 });
  });
  const notices = page.locator('[data-slot="toast"]:not([data-limited])');
  await expect(notices).toHaveCount(4);
  await expect.poll(async () => Math.round((await notices.first().boundingBox())?.y ?? -1)).toBe(16);
  await notices.first().hover();
  await expect(page.locator('[data-slot="toast-viewport"]')).toHaveAttribute("data-expanded");
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
      if (target?.closest('[data-slot="toast"]')) { animation.pause(); animation.currentTime = 50; }
    }
  });
  await expect(notices.nth(1).locator('[data-slot="toast-content"]')).toHaveCSS("opacity", "0");
  await page.screenshot({ path: testInfo.outputPath("toast-expanding.png") });
  await page.evaluate(() => document.getAnimations().forEach((animation) => {
    if (animation.playState === "paused") animation.finish();
  }));
  await expect(notices.nth(3).locator('[data-slot="toast-content"]')).toHaveCSS("opacity", "1");
  await page.mouse.move(1, 500);
  for (let index = 0; index < 6; index++) {
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(30);
  }
  await expect(page.getByRole("dialog", { name: "搜索页面、运行时或应用" })).toHaveCount(0);
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("combobox")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "搜索页面、运行时或应用" })).toHaveCount(0);
});
