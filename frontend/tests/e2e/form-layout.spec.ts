import { expect, test, type Locator } from "@playwright/test";

/** 记录表单内部尺寸，忽略浏览器聚焦无效字段时产生的页面滚动。 */
async function geometry(form: Locator) {
  return form.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const button = element.querySelector('[type="submit"]');
    if (!button) throw new Error("表单缺少提交入口");
    return {
      height: bounds.height,
      submitY: button.getBoundingClientRect().y - bounds.y,
      errors: Array.from(
        element.querySelectorAll('[data-slot="field-error"]'),
        (error) => error.getBoundingClientRect().height,
      ),
    };
  });
}

test("setup reserves every field error before validation", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/setup?scenario=setup");
  const submit = page.getByRole("button", { name: "创建管理员", exact: true });
  await expect(submit).toBeVisible();
  const form = page.locator("form");
  const before = await geometry(form);
  expect(before.errors).toEqual([40, 40, 40, 40]);
  await submit.click();
  await expect(page.getByText("请输入完整的本机初始化凭据")).toBeVisible();
  expect(await geometry(form)).toEqual(before);
});

test("settings and password validation leave form geometry unchanged", async ({
  page,
}) => {
  await page.goto("/settings");
  const timezone = page.getByLabel("显示时区（server / browser / IANA 名称）");
  await timezone.fill("not-a-timezone");
  const preferences = page.locator("form").filter({ has: timezone });
  const before = await geometry(preferences);
  await preferences
    .getByRole("button", { name: "保存设置", exact: true })
    .click();
  await expect(
    preferences.getByText("使用 server、browser 或有效 IANA 时区"),
  ).toBeVisible();
  expect(await geometry(preferences)).toEqual(before);

  const password = page
    .locator("form")
    .filter({ has: page.getByLabel("当前密码", { exact: true }) });
  const passwordBefore = await geometry(password);
  await password.getByRole("button", { name: "修改密码并撤销旧会话" }).click();
  await expect(password.getByText("新密码至少 12 个字符")).toBeVisible();
  expect(await geometry(password)).toEqual(passwordBefore);
});

test("application draft reserves validation space inside its sheet", async ({
  page,
}) => {
  await page.goto("/apps");
  await page.getByRole("button", { name: "新建应用", exact: true }).click();
  const form = page.getByRole("dialog").locator("form");
  await expect(form.getByLabel("应用名称", { exact: true })).toBeVisible();
  const before = await geometry(form);
  expect(before.errors.length).toBeGreaterThan(4);
  expect(before.errors.every((height) => height === 40)).toBe(true);
  await form
    .getByRole("button", { name: "预检并核对影响", exact: true })
    .click();
  await expect(
    form.locator('[data-slot="field-error"][role="alert"]').first(),
  ).toBeVisible();
  expect(await geometry(form)).toEqual(before);
});
