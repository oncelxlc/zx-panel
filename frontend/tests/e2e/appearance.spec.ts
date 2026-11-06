import { expect, test } from "@playwright/test";

test("sidebar appearance controls preserve selection, keyboard focus and saved preferences", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/overview");
  const footer = page.locator('[data-slot="sidebar-footer"]');
  const trigger = footer.getByRole("button", { name: "选择主题", exact: true });
  await expect(page.locator("header").getByRole("button", { name: /选择主题|账号菜单/ })).toHaveCount(0);
  await expect(footer.getByText("当前服务器")).toHaveCount(0);
  await expect(footer.getByRole("button", { name: "账号菜单", exact: true })).toBeVisible();
  await trigger.focus();
  await page.keyboard.press("Enter");
  const popup = page.getByRole("dialog", { name: "外观设置" });
  const automatic = popup.getByRole("button", { name: "自动，跟随系统" });
  await expect(automatic).toHaveAttribute("aria-pressed", "true");
  await automatic.click();
  await expect(automatic).toHaveAttribute("aria-pressed", "true");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await popup.getByRole("button", { name: "亮色", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await popup.getByRole("button", { name: "默认", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  const islands = popup.getByRole("button", { name: "Islands", exact: true });
  await expect(islands).toBeFocused();
  await page.keyboard.press("Space");
  await expect(islands).toHaveAttribute("aria-pressed", "true");
  await islands.click();
  await expect(islands).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.reload();
  await expect(page.locator('[data-slot="sidebar"][data-variant="sidebar"]')).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-theme-style", "islands");
  await trigger.click();
  await popup.getByRole("button", { name: "默认", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme-style", "default");
  await page.keyboard.press("Escape");
  await footer.getByRole("button", { name: "账号菜单", exact: true }).click();
  await page.getByRole("menuitem", { name: "账号与设置", exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await footer.getByRole("button", { name: "账号菜单", exact: true }).click();
  await page.getByRole("menuitem", { name: "退出登录", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("Islands keeps layout geometry stable and footer popovers clear of collapsed navigation", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  /** 记录外壳、导航、正文和图表尺寸，避免仅比较外层宽度漏掉内部重排。 */
  async function measureLayout() {
    return page.locator([
      '[data-slot="sidebar-container"]',
      '[data-slot="sidebar-inner"]',
      '[data-slot="sidebar-header"]',
      '[data-slot="sidebar-menu-button"]',
      '[data-slot="sidebar-footer"]',
      '[data-slot="sidebar-footer"] button',
      '[data-slot="sidebar-inset"]',
      '[data-slot="sidebar-inset"] > header',
      '#main-content',
      '#main-content h1',
      '#main-content [data-slot="card"]',
      '#main-content [data-slot="chart"]',
    ].join(", ")).evaluateAll((elements) => elements.map((element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    }));
  }

  for (const theme of ["light", "dark"]) {
    await page.addInitScript((mode) => {
      localStorage.setItem("zx-panel-theme", mode);
      localStorage.setItem("zx-panel-theme-style", "default");
    }, theme);
    for (const { width, height } of [
      { width: 1440, height: 1000 },
      { width: 1100, height: 1000 },
      { width: 375, height: 1000 },
      { width: 812, height: 375 },
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto("/overview");
      await expect(page.getByRole("heading", { name: "概览", exact: true })).toBeVisible();
      await expect(page.getByRole("application").first()).toBeVisible();
      const notice = page.locator('[data-slot="toast"]').filter({ hasText: "1 个任务需要处理" });
      await expect(notice).toBeVisible();
      await notice.hover();
      await notice.getByRole("button", { name: "关闭提示", exact: true }).click();
      await expect(notice).toHaveCount(0);
      const header = page.locator('[data-slot="sidebar-inset"] > header');
      const body = page.locator("#main-content");
      if (width < 1024) {
        await page.getByRole("button", { name: "切换导航", exact: true }).click();
      }
      const trigger = page.getByRole("button", { name: "选择主题", exact: true });
      await trigger.click();
      const popup = page.getByRole("dialog", { name: "外观设置" });
      await expect(popup).toBeVisible();
      await expect(popup).toHaveCSS("scale", "1");
      const before = await measureLayout();
      for (const style of ["islands", "default", "islands"]) {
        await popup.getByRole("button", { name: style === "islands" ? "Islands" : "默认", exact: true }).click();
        await expect(page.locator("html")).toHaveAttribute("data-theme-style", style);
        expect(await measureLayout(), `${theme}/${width}/${style} 应保持所有区域的坐标和尺寸`).toEqual(before);
      }
      for (const surface of [header, body]) {
        expect(await surface.evaluate((element) => getComputedStyle(element, "::before").borderRadius)).toBe("16px");
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const popupBox = await popup.boundingBox();
      if (!popupBox) throw new Error("外观设置弹层不可见");
      expect(popupBox.x).toBeGreaterThanOrEqual(0);
      expect(popupBox.x + popupBox.width).toBeLessThanOrEqual(width);
      expect(popupBox.y).toBeGreaterThanOrEqual(0);
      expect(popupBox.y + popupBox.height).toBeLessThanOrEqual(height);
      if (width === 1100) {
        const sidebar = await page.locator('[data-slot="sidebar-container"]').boundingBox();
        const button = await trigger.boundingBox();
        if (!sidebar || !button) throw new Error("折叠导航或主题按钮不可见");
        expect(sidebar.width).toBe(64);
        expect(popupBox.x).toBeGreaterThanOrEqual(sidebar.x + sidebar.width + 8);
        expect(popupBox.y + popupBox.height).toBeCloseTo(button.y + button.height, 0);
      }
      await page.screenshot({ path: testInfo.outputPath(`islands-${theme}-${width}.png`) });
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      const account = page.getByRole("button", { name: "账号菜单", exact: true });
      await account.click();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      await expect(menu).toHaveCSS("scale", "1");
      if (width === 1100) {
        const menuBox = await menu.boundingBox();
        const button = await account.boundingBox();
        if (!menuBox || !button) throw new Error("账号菜单或按钮不可见");
        expect(menuBox.x).toBeGreaterThanOrEqual(72);
        expect(menuBox.y + menuBox.height).toBeCloseTo(button.y + button.height, 0);
        await page.screenshot({ path: testInfo.outputPath(`account-${theme}-collapsed.png`) });
      }
      if (width < 1024) {
        await expect(page.getByRole("dialog", { name: "主导航" })).toBeVisible();
        await page.getByRole("menuitem", { name: "账号与设置", exact: true }).click();
        await expect(page).toHaveURL(/\/settings$/);
        await expect(page.getByRole("dialog")).toHaveCount(0);
      } else {
        await page.keyboard.press("Escape");
        await expect(account).toBeFocused();
      }
    }
  }
});

test("open footer panels follow sidebar collapse without covering its controls", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/overview");
  const sidebar = page.locator('[data-slot="sidebar-container"]');
  for (const name of ["选择主题", "账号菜单"]) {
    const trigger = page.getByRole("button", { name, exact: true });
    await trigger.click();
    const popup = name === "选择主题"
      ? page.getByRole("dialog", { name: "外观设置" })
      : page.getByRole("menu", { name: "账号菜单" });
    await expect(popup).toBeVisible();
    await page.keyboard.press("Control+b");
    await expect(sidebar).toHaveCSS("width", "64px");
    await expect(popup).toHaveAttribute("data-side", "right");
    const bounds = await popup.boundingBox();
    if (!bounds) throw new Error("侧栏折叠后弹层不可见");
    expect(bounds.x).toBeGreaterThanOrEqual(72);
    await page.keyboard.press("Control+b");
    await expect(sidebar).toHaveCSS("width", "224px");
    await expect(popup).toHaveAttribute("data-side", "top");
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  }
});

test("footer tooltips stay outside collapsed navigation in both shell styles", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.emulateMedia({ colorScheme: "dark" });
  for (const style of ["default", "islands"]) {
    await page.addInitScript((value) => localStorage.setItem("zx-panel-theme-style", value), style);
    await page.goto("/overview");
    const sidebar = page.locator('[data-slot="sidebar-container"]');
    for (const expanded of [false, true]) {
      await expect(sidebar).toHaveCSS("width", expanded ? "224px" : "64px");
      for (const [name, label] of [["选择主题", "外观设置"], ["账号菜单", "账号菜单"]]) {
        const trigger = page.getByRole("button", { name, exact: true });
        await trigger.hover();
        const tooltip = page.locator('[data-slot="tooltip-content"]').filter({ hasText: label });
        await expect(tooltip).toBeVisible();
        await expect(tooltip).toHaveAttribute("data-side", expanded ? "top" : "right");
        await expect(tooltip).toHaveCSS("scale", "1");
        const tip = await tooltip.boundingBox();
        const button = await trigger.boundingBox();
        if (!tip || !button) throw new Error("底部按钮或悬停提示不可见");
        if (expanded) {
          expect(tip.y + tip.height).toBeLessThanOrEqual(button.y);
        } else {
          expect(tip.x).toBeGreaterThanOrEqual(72);
          expect(tip.x + tip.width).toBeLessThanOrEqual(1100);
          await page.screenshot({ path: testInfo.outputPath(`${style}-${name}-tooltip.png`) });
        }
        await page.mouse.move(600, 400);
        await expect(tooltip).toHaveCount(0);
      }
      if (!expanded) await page.getByRole("button", { name: "切换导航", exact: true }).click();
    }
  }
});
