import { expect, test } from "@playwright/test";

test("all primary routes, navigation, confirmation and task deep links", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/overview");
  await expect(
    page.getByRole("heading", { name: "概览", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("演示数据 · 当前操作不会影响真实服务器"),
  ).toBeVisible();
  await page.getByRole("link", { name: "运行时", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "运行时", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "管理版本" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Node.js", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "安装版本", exact: true }).click();
  await page.getByRole("button", { name: "安装", exact: true }).first().click();
  await expect(
    page.getByRole("heading", { name: "核对操作计划" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "确认并创建任务" }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: "我已核对目标与影响范围" }).check();
  await page.getByRole("button", { name: "确认并创建任务" }).click();
  await expect(page).toHaveURL(/task=task-/);
  await expect(page.getByText("已完成", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  for (const [route, title] of [
    ["/apps", "应用与进程"],
    ["/monitoring", "监控"],
    ["/logs", "日志"],
    ["/settings", "设置"],
  ]) {
    await page.goto(route);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("two themes and five layout breakpoints", async ({ page }, testInfo) => {
  for (const theme of ["light", "dark"]) {
    await page.addInitScript(
      (value) => localStorage.setItem("zx-panel-theme", value),
      theme,
    );
    for (const width of [1440, 1280, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/overview");
      await expect(
        page.getByRole("heading", { name: "概览", exact: true }),
      ).toBeVisible();
      await expect(page.getByText("18.4%", { exact: true })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const fits = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
      expect(fits, `${theme} ${width}px should not overflow`).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`overview-${theme}-${width}.png`),
        fullPage: true,
      });
    }
  }
});

test("six pages in both themes on desktop and mobile", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  for (const theme of ["light", "dark"]) {
    await page.addInitScript(
      (value) => localStorage.setItem("zx-panel-theme", value),
      theme,
    );
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const [path, title] of [
        ["overview", "概览"],
        ["runtimes", "运行时"],
        ["apps", "应用与进程"],
        ["monitoring", "监控"],
        ["logs", "日志"],
        ["settings", "设置"],
      ]) {
        await page.goto("/" + path);
        await expect(
          page.getByRole("heading", { name: title, exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("status", { name: "正在加载" }),
        ).toHaveCount(0);
        if (path === "overview" || path === "monitoring")
          await expect(page.getByRole("application").first()).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${path} ${theme} ${width}`,
        ).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(`${path}-${theme}-${width}.png`),
          fullPage: true,
        });
      }
    }
  }
});

test("keyboard search, references, disk IO and dirty draft guard", async ({
  page,
}) => {
  await page.goto("/overview");
  await expect(
    page.getByRole("heading", { name: "概览", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+k");
  const search = page.getByRole("combobox");
  await expect(search).toBeFocused();
  await search.fill("监控");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "监控", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "磁盘", exact: true }).click();
  await expect(page.getByText("磁盘读取", { exact: true })).toBeVisible();
  await page.goto("/runtimes/node");
  await page
    .getByRole("button", { name: /个应用 · 查看引用/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "安装引用" })).toBeVisible();
  await expect(page.getByText("扫描已完成", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/apps");
  await page.getByRole("button", { name: "新建应用", exact: true }).click();
  await page.getByLabel("应用名称", { exact: true }).fill("draft-test");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: "放弃未提交的应用配置？" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "继续编辑" }).click();
  await expect(page.getByLabel("应用名称", { exact: true })).toHaveValue(
    "draft-test",
  );
});

test("deterministic empty, stale, warming, unsupported and session scenarios", async ({
  page,
}) => {
  await page.goto("/runtimes/node?scenario=empty");
  await expect(
    page.getByText("尚未发现已安装版本", { exact: true }),
  ).toBeVisible();
  await page.goto("/overview?scenario=stale");
  await expect(page.getByText("不可用", { exact: true }).first()).toBeVisible();
  await page.goto("/overview?scenario=warming-up");
  await expect(page.getByText("采集中", { exact: true }).first()).toBeVisible();
  await page.goto("/runtimes/node?action=install&scenario=unsupported");
  await expect(
    page.getByRole("button", { name: "安装", exact: true }).first(),
  ).toBeDisabled();
  await page.goto("/overview?scenario=stream-disconnected");
  await expect(
    page.getByText("实时连接中断，已切换轮询", { exact: true }),
  ).toBeVisible();
  await page.goto("/overview?scenario=session-expired");
  await expect(page.getByRole("heading", { name: "欢迎回来" })).toBeVisible();
  await page.goto("/login?scenario=setup");
  await expect(
    page.getByRole("heading", { name: "初始化 zx-panel" }),
  ).toBeVisible();
});

test("flooded logs stay bounded and render a virtual window", async ({
  page,
}) => {
  await page.goto("/logs?scenario=log-flood");
  await expect(page.getByText(/缓冲已裁剪 \d+ 条记录/)).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("5000 条显示", { exact: true })).toBeVisible();
  expect(
    await page
      .getByRole("region", { name: "日志纯文本，可选择复制" })
      .locator(".absolute")
      .count(),
  ).toBeLessThan(100);
  await page.getByRole("button", { name: "暂停显示", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "恢复显示", exact: true }),
  ).toBeVisible();
  const rows = page.getByRole("region", { name: "日志纯文本，可选择复制" }).locator(".absolute");
  const frozen = await rows.last().innerText();
  await expect.poll(async () => Number((await page.getByText(/^新增 \d+ 条$/).innerText()).match(/\d+/)?.[0] ?? 0)).toBeGreaterThanOrEqual(750);
  await expect(rows.last()).toHaveText(frozen, { useInnerText: true });
  await page.getByRole("button", { name: "恢复显示", exact: true }).click();
  await expect(rows.last()).not.toHaveText(frozen, { useInnerText: true });
});

test("mobile Sheet navigation and cross-tab theme preference", async ({
  page,
  context,
}) => {
  await page.goto("/overview");
  await expect(
    page.getByRole("heading", { name: "概览", exact: true }),
  ).toBeVisible();
  const second = await context.newPage();
  await second.goto("/overview");
  await expect(
    second.getByRole("heading", { name: "概览", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "选择主题" }).click();
  await page.getByRole("menuitem", { name: "暗色", exact: true }).click();
  await expect(second.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "选择主题" }).click();
  await page.getByRole("menuitem", { name: "亮色", exact: true }).click();
  await expect(second.locator("html")).toHaveAttribute("data-theme", "light");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "切换导航" }).click();
  await page.getByRole("link", { name: "日志", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "日志", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
