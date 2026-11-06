import { expect, test } from "@playwright/test";

test("login stays dark with one background across system themes and viewport sizes", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    localStorage.setItem("zx-panel-theme", "light"),
  );
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "欢迎回来" })).toBeVisible();
  await expect(page.locator(".login-page__image")).toHaveJSProperty(
    "naturalWidth",
    1672,
  );

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator(".login-page__background img")).toHaveCount(1);
    await expect(page.locator(".login-page__image")).toHaveAttribute(
      "src",
      "/login/login-bg-lines.webp",
    );
    expect(
      await page.evaluate(() => localStorage.getItem("zx-panel-theme")),
    ).toBe("light");
  }
  await expect(page.getByRole("button", { name: /主题/ })).toHaveCount(0);
  const palette = await page.locator(".login-page").evaluate((element) => {
    const style = getComputedStyle(element);
    return [
      "--background",
      "--foreground",
      "--primary",
      "--primary-foreground",
      "--secondary",
      "--muted",
      "--muted-foreground",
      "--border",
      "--input",
      "--ring",
    ].map((token) => style.getPropertyValue(token).trim());
  });
  for (const color of palette) expect(color).toMatch(/^#([\da-f]{1,2})\1\1$/i);
  expect(
    await page
      .locator('[data-slot="card"]')
      .evaluate(
        (element) => getComputedStyle(element, "::before").backgroundImage,
      ),
  ).toContain("/login/login-bg-lines.webp");

  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
    [768, 1024],
    [375, 812],
    [320, 568],
    [812, 375],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator(".login-page")).toHaveCSS(
      "min-height",
      `${height}px`,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const input = page.getByRole("textbox", { name: "账号", exact: true });
    const submit = page.getByRole("button", { name: "登录控制台" });
    await expect(input).toBeVisible();
    await expect(submit).toBeVisible();
    expect((await input.boundingBox())?.height).toBe(36);
    expect((await submit.boundingBox())?.height).toBe(36);
    const card = await page.locator('[data-slot="card"]').boundingBox();
    expect((card?.height ?? 0) / (card?.width ?? 1)).toBeGreaterThanOrEqual(
      4 / 3,
    );
    expect(card?.width).toBe(Math.min(352, width - 48));
    const title = await page
      .getByRole("heading", { name: "欢迎回来" })
      .boundingBox();
    const label = await page.locator('label[for="username"]').boundingBox();
    expect(
      (label?.y ?? 0) - ((title?.y ?? 0) + (title?.height ?? 0)),
    ).toBeLessThanOrEqual(32);
    const accountBounds = await input.boundingBox();
    const passwordLabel = await page
      .locator('label[for="password"]')
      .boundingBox();
    const passwordBounds = await page
      .locator('[data-slot="input-group"]')
      .boundingBox();
    const submitBounds = await submit.boundingBox();
    expect(
      (passwordLabel?.y ?? 0) -
        ((accountBounds?.y ?? 0) + (accountBounds?.height ?? 0)),
    ).toBeLessThanOrEqual(40);
    expect(
      (submitBounds?.y ?? 0) -
        ((passwordBounds?.y ?? 0) + (passwordBounds?.height ?? 0)),
    ).toBeLessThanOrEqual(40);
    await page.screenshot({
      path: testInfo.outputPath(`login-${width}-${height}.png`),
      fullPage: true,
    });
  }
});

test("login enters once, stays still on hover and respects reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/login");
  const card = page.locator('[data-slot="card"]');
  const panel = page.getByRole("region", { name: "欢迎回来", exact: true });
  await expect(card).toBeVisible();
  const frames = await panel.evaluate((element) => {
    const animation = element.getAnimations()[0];
    if (!animation?.effect) throw new Error("缺少浮入动效");
    const duration = Number(animation.effect.getComputedTiming().duration);
    animation.pause();
    animation.currentTime = 0;
    const startOpacity = Number(getComputedStyle(element).opacity);
    const height = element.clientHeight;
    animation.currentTime = duration / 2;
    const middleOpacity = Number(getComputedStyle(element).opacity);
    animation.finish();
    return {
      startOpacity,
      middleOpacity,
      height,
      finalHeight: element.clientHeight,
    };
  });
  expect(frames.startOpacity).toBe(0);
  expect(frames.middleOpacity).toBeGreaterThan(0);
  expect(frames.middleOpacity).toBeLessThan(1);
  expect(frames.finalHeight).toBe(frames.height);
  const beforeHover = await card.boundingBox();
  await card.hover();
  await expect(card).toHaveCSS("transform", "none");
  expect(await card.evaluate((element) => element.getAnimations().length)).toBe(
    0,
  );
  expect(await card.boundingBox()).toEqual(beforeHover);
  await panel.hover({ position: { x: 2, y: 2 } });
  await expect(card).toHaveCSS("transform", "none");
  expect(await card.boundingBox()).toEqual(beforeHover);
  const input = page.getByRole("textbox", { name: "账号", exact: true });
  await input.fill("demo");
  await expect(input).toBeFocused();
  await expect(card).toHaveCSS("transform", "none");
  await expect(panel).toHaveCSS("animation-duration", "0s");
  await input.blur();
  expect(
    await panel.evaluate((element) =>
      element
        .getAnimations()
        .every((animation) => animation.playState === "finished"),
    ),
  ).toBe(true);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(card).toBeVisible();
  await card.hover();
  await expect(panel).toHaveCSS("animation-name", "none");
  await expect(card).toHaveCSS("transform", "none");
});

test("minimal login preserves keyboard validation, field actions and the saved panel theme", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    localStorage.setItem("zx-panel-theme", "light"),
  );
  await page.goto("/overview?scenario=session-expired");
  const username = page.getByRole("textbox", { name: "账号", exact: true });
  const password = page.getByLabel("密码", { exact: true });
  const submit = page.getByRole("button", { name: "登录控制台" });
  await expect(submit).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const card = page.locator('[data-slot="card"]');
  const before = await card.boundingBox();
  const buttonBefore = await submit.boundingBox();
  await submit.focus();
  await page.keyboard.press("Enter");
  await expect(username).toBeFocused();
  await expect(username).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator('[data-slot="field-error"]')).toHaveCount(2);
  expect(await card.boundingBox()).toEqual(before);
  expect(await submit.boundingBox()).toEqual(buttonBefore);
  await page.screenshot({ path: testInfo.outputPath("login-validation.png") });

  await username.fill("错误账号");
  await expect(page.locator("#username-error")).toHaveText(
    "账号仅支持字母、数字、下划线、点和短横线",
  );
  expect(
    await page.locator("#username-error").evaluate((element) => ({
      height: element.clientHeight,
      contentHeight: element.scrollHeight,
    })),
  ).toEqual({ height: 32, contentHeight: 32 });
  expect(await card.boundingBox()).toEqual(before);
  expect(await submit.boundingBox()).toEqual(buttonBefore);

  await username.fill("demo");
  await page.keyboard.press("Tab");
  await expect(password).toBeFocused();
  await expect(page.getByRole("button", { name: "清空账号" })).toHaveCount(0);
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
  expect(
    await page.evaluate(() => localStorage.getItem("zx-panel-theme")),
  ).toBe("light");
});

test("touch login keeps compact fields usable", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
    viewport: { width: 375, height: 812 },
  });
  const page = await context.newPage();
  try {
    await page.goto("/login");
    await expect(
      page.getByRole("button", { name: "登录控制台" }),
    ).toBeVisible();
    expect(
      (
        await page
          .getByRole("textbox", { name: "账号", exact: true })
          .boundingBox()
      )?.height,
    ).toBe(44);
    expect(
      (await page.getByRole("button", { name: "显示密码" }).boundingBox())
        ?.height,
    ).toBe(44);
    expect(
      (await page.getByRole("button", { name: "登录控制台" }).boundingBox())
        ?.height,
    ).toBe(44);
  } finally {
    await context.close();
  }
});
