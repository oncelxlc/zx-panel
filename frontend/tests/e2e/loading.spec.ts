import { expect, test } from "@playwright/test";

test("public routes defer the authenticated shell and direct panel navigation still loads it", async ({
  page,
}) => {
  const shellRequests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => {
    if (/\/src\/(?:layouts\/main\/MainLayout|auth\/AuthGuard)\.tsx(?:\?|$)/.test(request.url())) {
      shellRequests.push(request.url());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "欢迎回来", exact: true })).toBeVisible();
  expect(shellRequests).toEqual([]);

  await page.goto("/setup?scenario=setup");
  await expect(page.getByRole("heading", { name: "初始化 zx-panel", exact: true })).toBeVisible();
  expect(shellRequests).toEqual([]);

  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: "概览", exact: true })).toBeVisible();
  expect(shellRequests.some((url) => url.includes("/MainLayout.tsx"))).toBe(true);
  expect(shellRequests.some((url) => url.includes("/AuthGuard.tsx"))).toBe(true);
  expect(errors).toEqual([]);
});
