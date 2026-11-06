import { expect, test } from "@playwright/test";

test("login stays dark with one background across system themes and viewport sizes", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem("zx-panel-theme", "light"));
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "欢迎回来" })).toBeVisible();
  await expect(page.locator(".login-page__image")).toHaveJSProperty("naturalWidth", 1672);

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator(".login-page__background img")).toHaveCount(1);
    await expect(page.locator(".login-page__image")).toHaveAttribute("src", "/login/login-bg-lines.webp");
    expect(await page.evaluate(() => localStorage.getItem("zx-panel-theme"))).toBe("light");
  }
  await expect(page.getByRole("button", { name: /主题/ })).toHaveCount(0);

  for (const [width, height] of [[1440, 900], [1024, 768], [768, 1024], [375, 812], [812, 375]]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator(".login-page")).toHaveCSS("min-height", `${height}px`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const input = page.getByRole("textbox", { name: "账号", exact: true });
    const submit = page.getByRole("button", { name: "登录控制台" });
    await expect(input).toBeVisible();
    await expect(submit).toBeVisible();
    expect((await input.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect((await submit.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: testInfo.outputPath(`login-${width}-${height}.png`), fullPage: true });
  }
});

test("minimal login preserves keyboard validation, field actions and the saved panel theme", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem("zx-panel-theme", "light"));
  await page.goto("/overview?scenario=session-expired");
  const username = page.getByRole("textbox", { name: "账号", exact: true });
  const password = page.getByLabel("密码", { exact: true });
  const submit = page.getByRole("button", { name: "登录控制台" });
  await expect(submit).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await submit.focus();
  await page.keyboard.press("Enter");
  await expect(username).toBeFocused();
  await expect(username).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator('[data-slot="field-error"]')).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath("login-validation.png") });

  await username.fill("demo");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "清空账号" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(username).toBeFocused();
  await expect(username).toHaveValue("");
  await username.fill("demo");
  await password.fill("test-password");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "显示密码" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(password).toHaveAttribute("type", "text");
  await page.keyboard.press("Enter");
  await expect(password).toHaveAttribute("type", "password");
  await page.keyboard.press("Tab");
  await expect(submit).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/overview\?scenario=session-expired$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => localStorage.getItem("zx-panel-theme"))).toBe("light");
});
