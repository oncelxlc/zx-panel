import { expect, test } from "@playwright/test";

test("toasts stack at the top right and expand to at most eight in both themes", async ({ page }, testInfo) => {
  for (const theme of ["light", "dark"]) {
    await page.addInitScript((value) => localStorage.setItem("zx-panel-theme", value), theme);
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/settings");
      await expect(page.getByRole("heading", { name: "设置", exact: true })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await page.evaluate(async () => {
        const modulePath = "/src/lib/toast.ts";
        const { toast } = await import(modulePath);
        for (let index = 1; index <= 10; index++) {
          toast.add({ title: `通知 ${index}`, description: "检查通知堆叠、展开与关闭", type: "warning", timeout: 0 });
        }
      });
      const viewport = page.locator('[data-slot="toast-viewport"]');
      const active = page.locator('[data-slot="toast"]:not([data-limited])');
      await expect(active).toHaveCount(8);
      await expect(viewport).not.toHaveAttribute("data-expanded");
      await expect(active.first()).toHaveCSS("opacity", "1");
      await expect(active.nth(3)).toHaveCSS("opacity", "0");
      const front = await active.first().boundingBox();
      expect(front).not.toBeNull();
      expect(front?.y).toBe(16);
      expect(Math.round((front?.x ?? 0) + (front?.width ?? 0))).toBe(width - 16);
      await page.screenshot({ path: testInfo.outputPath(`toast-collapsed-${theme}-${width}.png`) });
      await active.first().hover();
      await expect(viewport).toHaveAttribute("data-expanded");
      await expect(active.nth(7)).toHaveCSS("opacity", "1");
      await expect(page.locator('[data-slot="toast"][data-limited]').first()).toHaveCSS("opacity", "0");
      const boxes = await active.evaluateAll((elements) => elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom };
      }));
      expect(boxes.every((box, index) => index === 0 || box.top > boxes[index - 1].bottom)).toBe(true);
      expect(boxes.at(-1)?.bottom).toBeLessThan(1000);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`toast-expanded-${theme}-${width}.png`) });
      await page.mouse.move(1, 500);
      await expect(viewport).not.toHaveAttribute("data-expanded");
      await page.keyboard.press("F6");
      await expect(viewport).toBeFocused();
      await expect(viewport).toHaveAttribute("data-expanded");
      await active.first().getByRole("button", { name: "关闭提示" }).focus();
      await expect(viewport).toHaveAttribute("data-expanded");
      await page.keyboard.press("Enter");
      await expect(page.getByText("通知 10", { exact: true })).toHaveCount(0);
    }
  }
});

test("operation failures use actionable Toast while the review and confirmation stay in the Sheet", async ({ page }) => {
  await page.goto("/runtimes/node?action=install&scenario=plan-expired");
  await page.getByRole("button", { name: "安装", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "核对操作计划" })).toBeVisible();
  const submit = page.getByRole("button", { name: "确认并创建任务" });
  await expect(submit).toBeDisabled();
  await page.getByRole("checkbox", { name: "我已核对目标与影响范围" }).check();
  await submit.click();
  const notice = page.locator('[data-slot="toast"]');
  await expect(notice.getByText("请重新预检", { exact: true })).toBeVisible();
  await expect(notice).toContainText("资源或计划已经变化，请重新预检。");
  await expect(submit).toBeDisabled();
  await notice.hover();
  await notice.getByRole("button", { name: "关闭提示" }).click();
  await page.getByRole("button", { name: "重新预检", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "我已核对目标与影响范围" })).not.toBeChecked();
  await expect(submit).toBeDisabled();
});
