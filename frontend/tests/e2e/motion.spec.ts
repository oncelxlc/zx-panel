import { expect, test } from "@playwright/test";

// 动效回归必须覆盖正常速度；其他功能测试仍沿用减少动态效果配置。
test.use({ reducedMotion: "no-preference" });

test("sidebar keeps header and content edges continuous while collapsing and expanding", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/overview");
  await expect(page.getByRole("application").first()).toBeVisible();
  const trigger = page.getByRole("button", { name: "切换导航", exact: true });
  const content = page.locator('[data-slot="sidebar-inset"]');

  for (const expanded of [false, true]) {
    const before = await content.boundingBox();
    expect(before).not.toBeNull();
    await trigger.evaluate((button: HTMLButtonElement) => button.click());
    const frames = await page.evaluate(async () => {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const sidebar = document.querySelector('[data-slot="sidebar-container"]');
      const inset = document.querySelector('[data-slot="sidebar-inset"]');
      const header = inset?.querySelector("header");
      const body = document.getElementById("main-content");
      if (!sidebar || !inset || !header || !body) throw new Error("缺少侧栏布局元素");
      /** 只记录边缘与宽度，避免 DOMRect 序列化丢失类型信息。 */
      function bounds(element: Element) {
        const { x, right, width } = element.getBoundingClientRect();
        return { x, right, width };
      }
      const animations = document.getAnimations().filter((animation) => {
        const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
        return target?.closest('[data-slot="sidebar"]') || target === inset;
      });
      animations.forEach((animation) => animation.pause());
      const samples = [0, 50, 100, 150, 200, 250, 300].map((time) => {
        animations.forEach((animation) => { animation.currentTime = time; });
        return {
          time,
          sidebarRight: sidebar.getBoundingClientRect().right,
          content: bounds(inset),
          header: bounds(header),
          body: bounds(body),
          viewportWidth: document.documentElement.clientWidth,
        };
      });
      animations.forEach((animation) => animation.finish());
      return samples;
    });
    expect(frames[0].content.x).toBeCloseTo(before?.x ?? -1, 0);
    expect(frames[0].content.width).toBeCloseTo(before?.width ?? -1, 0);
    for (const frame of frames) {
      expect(frame.content.x, `侧栏边缘，${frame.time}ms`).toBeCloseTo(frame.sidebarRight, 0);
      expect(frame.header.x).toBeCloseTo(frame.content.x, 0);
      expect(frame.body.x).toBeCloseTo(frame.content.x, 0);
      expect(frame.content.right, `内容右边缘，${frame.time}ms`).toBeCloseTo(frame.viewportWidth, 0);
      expect(frame.header.right).toBeCloseTo(frame.viewportWidth, 0);
      expect(frame.body.right).toBeCloseTo(frame.viewportWidth, 0);
    }
    expect(frames.some((frame) => frame.content.x > 64 && frame.content.x < 224)).toBe(true);
    expect(frames.at(-1)?.content.x).toBe(expanded ? 224 : 64);
    await expect(trigger).toHaveAttribute("aria-expanded", String(expanded));
  }
});

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
  expect(initialRow?.height).toBe(40);
  await expect(page.locator('[data-slot="sidebar-menu"]')).toHaveCSS("row-gap", "8px");
  await trigger.click();
  await expect(page.locator('[data-slot="sidebar-container"]')).toHaveCSS("width", "64px");
  await expect(label).toHaveCSS("opacity", "0");
  expect((await link.boundingBox())?.height).toBe(initialRow?.height);
  expect((await icon.boundingBox())?.x).toBe(initialIcon?.x);
  const footer = await page.locator('[data-slot="sidebar-footer"] [data-slot="item"]').boundingBox();
  expect(footer?.x).toBe(8);
  expect((footer?.x ?? 0) + (footer?.width ?? Infinity)).toBeLessThanOrEqual(56);
  await trigger.evaluate((button: HTMLButtonElement) => button.click());
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
  const chart = page.locator('[data-slot="chart"]');
  expect((await chart.locator("svg.recharts-surface").boundingBox())?.width ?? Infinity)
    .toBeLessThanOrEqual(((await chart.boundingBox())?.width ?? 0) + 1);
  await page.screenshot({ path: testInfo.outputPath("sidebar-expanding.png") });
  const sidebarEdge = await page.locator('[data-slot="sidebar-container"]').boundingBox();
  const contentEdge = await page.locator('[data-slot="sidebar-inset"]').boundingBox();
  expect(Math.abs((sidebarEdge?.width ?? 0) - (contentEdge?.x ?? Infinity))).toBeLessThan(1);
  await page.evaluate(() => document.getAnimations().forEach((animation) => {
    if (animation.playState === "paused") animation.finish();
  }));
  await expect(label).toHaveCSS("opacity", "1");
  for (const interval of [35, 35, 140, 60, 140, 60]) {
    await trigger.evaluate((button: HTMLButtonElement) => button.click());
    await page.waitForTimeout(interval);
    const alignment = await page.evaluate(() => {
      const sidebar = document.querySelector('[data-slot="sidebar-container"]')?.getBoundingClientRect();
      const content = document.querySelector('[data-slot="sidebar-inset"]')?.getBoundingClientRect();
      return sidebar && content ? Math.abs(sidebar.right - content.left) : Infinity;
    });
    expect(alignment).toBeLessThan(1);
  }
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(label).toHaveCSS("opacity", "1");
  await expect(page.locator('[data-slot="sidebar-container"]')).toHaveCSS("width", "224px");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await trigger.click();
  await expect(label).toHaveCSS("transition-delay", "0s");
  await expect(label).toHaveCSS("opacity", "0");
  await trigger.click();
  await expect(label).toHaveCSS("transition-delay", "0s");
  await expect(label).toHaveCSS("opacity", "1");
});

test("viewport resizing settles once at the breakpoint and preserves usable navigation", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/overview");
  await expect(page.getByRole("application").first()).toBeVisible();
  const trigger = page.getByRole("button", { name: "切换导航", exact: true });
  const sidebar = page.locator('[data-slot="sidebar-container"]');
  const content = page.locator('[data-slot="sidebar-inset"]');
  for (const width of [1279, 1281, 1278, 1282, 1279, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(25);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(sidebar).toHaveCSS("width", "224px");
  }
  await page.setViewportSize({ width: 1200, height: 1000 });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(sidebar).toHaveCSS("width", "64px");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(sidebar).toHaveCSS("width", "224px");
  // 缩放期间始终由正常布局定位正文，不保留旧视口坐标，也不覆盖手动选择。
  await trigger.evaluate((button: HTMLButtonElement) => button.click());
  await page.waitForTimeout(35);
  await page.setViewportSize({ width: 1400, height: 950 });
  await expect(content).toHaveCSS("transform", "none");
  await expect(sidebar).toHaveCSS("width", "64px");
  await page.waitForTimeout(250);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await page.screenshot({ path: testInfo.outputPath("sidebar-collapsed.png") });
  for (const width of [1023, 1024, 1023]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(content).toHaveCSS("transform", "none");
    expect((await content.boundingBox())?.x).toBe(width < 1024 ? 0 : 64);
  }
  await trigger.click();
  const mobileSidebar = page.getByRole("dialog", { name: "主导航", exact: true });
  await expect(mobileSidebar).toBeVisible();
  expect((await mobileSidebar.getByRole("link", { name: "运行时", exact: true }).boundingBox())?.height).toBe(44);
  await page.setViewportSize({ width: 1024, height: 1000 });
  await expect(mobileSidebar).toHaveCount(0);
  await expect(sidebar).toHaveCSS("width", "64px");
  await page.setViewportSize({ width: 1023, height: 1000 });
  await expect(mobileSidebar).toHaveCount(0);
  await trigger.click();
  await expect(mobileSidebar).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(mobileSidebar).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const viewport of [{ width: 375, height: 812 }, { width: 812, height: 375 }]) {
    await page.setViewportSize(viewport);
    // 实时任务提醒可能在测试期间到达，先关闭已显示的通知再操作窄屏导航。
    const dismiss = page.getByRole("button", { name: "关闭提示", exact: true }).first();
    if (await dismiss.isVisible()) {
      await dismiss.click();
      await expect(dismiss).toBeHidden();
    }
    const before = await content.boundingBox();
    await trigger.click();
    await expect(mobileSidebar).toBeVisible();
    expect(await content.boundingBox()).toEqual(before);
    await page.keyboard.press("Escape");
    await expect(mobileSidebar).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
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
