import { expect, test } from "@playwright/test";

test("system runtimes show versions and management actions", async ({
  page,
}, testInfo) => {
  for (const theme of ["light", "dark"]) {
    await page.addInitScript(
      (value) => localStorage.setItem("zx-panel-theme", value),
      theme,
    );
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/runtimes");
      await expect(
        page.getByRole("heading", { name: "Rust", exact: true }),
      ).toBeVisible();
      await expect(page.getByText("1.90.0", { exact: true })).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Python", exact: true }),
      ).toBeVisible();
      const buttonColors = await page
        .getByRole("button", { name: "管理安装", exact: true })
        .first()
        .evaluate((element) => {
          const style = getComputedStyle(element);
          return { text: style.color, background: style.backgroundColor };
        });
      expect(buttonColors.text).not.toBe(buttonColors.background);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`runtimes-${theme}-${width}.png`),
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "管理安装", exact: true })
        .first()
        .click();
      await expect(page).toHaveURL(/\/runtimes\/rust$/);
      await expect(
        page.getByText("/usr/local/bin/rustc", { exact: true }),
      ).toBeVisible();
      await expect(page.getByText("只读", { exact: true })).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "设为系统默认", exact: true }),
      ).toBeEnabled();
      await expect(
        page.getByRole("button", { name: "卸载预检", exact: true }),
      ).toBeEnabled();
      await expect(
        page.getByRole("button", { name: "安装版本", exact: true }),
      ).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`rust-${theme}-${width}.png`),
        fullPage: true,
      });
    }
  }
  await page.goto("/runtimes/rust?action=install");
  await expect(
    page.getByText("/usr/local/bin/rustc", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "可安装", exact: true }),
  ).toHaveCount(0);
});

test("helper permission guidance appears on entry and can be reopened", async ({
  page,
}, testInfo) => {
  for (const theme of ["light", "dark"]) {
    await page.addInitScript(
      (value) => localStorage.setItem("zx-panel-theme", value),
      theme,
    );
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/runtimes?scenario=helper-unavailable");
      const dialog = page.getByRole("alertdialog", {
        name: "需要启用管理权限",
      });
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByText(/sudo systemctl restart zx-panel-helper/),
      ).toBeVisible();
      await page.keyboard.press("Tab");
      await expect(dialog.locator(":focus")).toHaveCount(1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`helper-${theme}-${width}.png`),
        fullPage: true,
      });
      await dialog.getByRole("button", { name: "暂时浏览" }).click();
      await expect(dialog).toHaveCount(0);
      await page.getByRole("button", { name: "查看启动与重启步骤" }).click();
      await expect(dialog).toBeVisible();
    }
  }
});

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

test("overview trends in both themes across layout breakpoints", async ({
  page,
}, testInfo) => {
  for (const theme of ["light", "dark"]) {
    await page.addInitScript(
      (value) => localStorage.setItem("zx-panel-theme", value),
      theme,
    );
    for (const width of [1440, 1280, 1024, 768, 390, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/overview");
      await expect(
        page.getByRole("heading", { name: "概览", exact: true }),
      ).toBeVisible();
      await expect(page.getByText("18.4%", { exact: true })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.getByRole("tablist")).toHaveCount(0);
      for (const label of ["CPU", "内存", "根分区", "网络下行"]) {
        await expect(
          page
            .getByRole("region", { name: label, exact: true })
            .getByRole("application"),
        ).toBeVisible();
      }
      const cpu = await page
        .getByRole("region", { name: "CPU", exact: true })
        .boundingBox();
      const memory = await page
        .getByRole("region", { name: "内存", exact: true })
        .boundingBox();
      const disk = await page
        .getByRole("region", { name: "根分区", exact: true })
        .boundingBox();
      const trendCard = page.locator('[data-slot="card"]').filter({
        has: page.getByRole("heading", { name: "资源趋势", exact: true }),
      });
      const systemCard = page.locator('[data-slot="card"]').filter({
        has: page.getByRole("heading", { name: "本机信息", exact: true }),
      });
      const contentBounds = await trendCard.locator("..").boundingBox();
      const trendBounds = await trendCard.boundingBox();
      const systemBounds = await systemCard.boundingBox();
      expect(trendBounds?.width).toBe(contentBounds?.width);
      expect(systemBounds?.width).toBe(contentBounds?.width);
      expect(systemBounds?.x).toBe(trendBounds?.x);
      expect(systemBounds?.y).toBeGreaterThanOrEqual(
        (trendBounds?.y ?? 0) + (trendBounds?.height ?? 0),
      );
      await expect(systemCard.getByRole("term")).toHaveText([
        "主机名",
        "操作系统",
        "内核",
        "架构",
        "处理器",
        "逻辑核数",
        "内存",
        "启动时间",
        "运行时长",
      ]);
      await expect(systemCard.getByRole("definition")).toHaveCount(9);
      const detailColumns = await systemCard.locator("dl").evaluate(
        (element) =>
          getComputedStyle(element).gridTemplateColumns.split(" ").length,
      );
      if (width === 1440) {
        expect(detailColumns).toBe(3);
        expect(memory?.y).toBe(cpu?.y);
        expect(memory?.x).toBeGreaterThan(cpu?.x ?? 0);
        expect(disk?.x).toBe(cpu?.x);
        expect(disk?.y).toBeGreaterThan(cpu?.y ?? 0);
      } else if (width <= 390) {
        expect(detailColumns).toBe(1);
        expect(memory?.x).toBe(cpu?.x);
        expect(memory?.y).toBeGreaterThan(cpu?.y ?? 0);
      } else if (width === 1024) {
        expect(detailColumns).toBe(2);
      }
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

test("overview trends share the range and keep independent data tables", async ({
  page,
}) => {
  await page.goto("/overview?tab=network&range=1h");
  await expect(page.getByRole("application")).toHaveCount(4);
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await page.getByRole("combobox", { name: "范围", exact: true }).click();
  await page.getByRole("option", { name: "15 分钟", exact: true }).click();
  await expect(page).toHaveURL(/range=15m/);
  for (const label of ["CPU", "内存", "根分区", "网络下行"]) {
    const trend = page.getByRole("region", { name: label, exact: true });
    await expect(trend.getByText(/450 个时间点/)).toHaveCount(1);
    await trend.getByRole("button", { name: "查看数据表" }).click();
    await expect(trend.getByRole("table")).toBeVisible();
    await expect(
      trend.getByRole("button", { name: "收起数据表" }),
    ).toHaveAttribute("aria-expanded", "true");
  }
  await expect(page.getByRole("table")).toHaveCount(4);
  const cpu = page.getByRole("region", { name: "CPU", exact: true });
  await cpu.getByRole("button", { name: "收起数据表" }).click();
  await expect(page.getByRole("table")).toHaveCount(3);
  await expect(cpu.getByRole("table")).toHaveCount(0);
  const memory = page.getByRole("region", { name: "内存", exact: true });
  await expect(memory.getByRole("row").nth(1)).toContainText("42.5%");
  const network = page.getByRole("region", { name: "网络下行", exact: true });
  await expect(network.getByRole("row").nth(1)).toContainText("MiB/s");
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
      .locator("[data-slot=log-row]")
      .count(),
  ).toBeLessThan(100);
  await page.getByRole("button", { name: "暂停显示", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "恢复显示", exact: true }),
  ).toBeVisible();
  const rows = page
    .getByRole("region", { name: "日志纯文本，可选择复制" })
    .locator("[data-slot=log-row]");
  const frozen = await rows.last().innerText();
  await expect
    .poll(async () =>
      Number(
        (await page.getByText(/^新增 \d+ 条$/).innerText()).match(/\d+/)?.[0] ??
          0,
      ),
    )
    .toBeGreaterThanOrEqual(750);
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
  await page.getByRole("button", { name: "暗色", exact: true }).click();
  await expect(second.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "亮色", exact: true }).click();
  await expect(second.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Islands", exact: true }).click();
  await expect(second.locator("html")).toHaveAttribute("data-theme-style", "islands");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "切换导航" }).click();
  await page.getByRole("link", { name: "日志", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "日志", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
