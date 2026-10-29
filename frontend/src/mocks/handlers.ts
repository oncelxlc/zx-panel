import { delay, http, HttpResponse } from "msw";
import { z } from "zod";
import { operationSchema } from "@/lib/api/operations";
import {
  DEMO_TIME,
  demoApps,
  demoCapabilities,
  demoInstallations,
  demoMetrics,
  demoReleases,
  demoSystem,
  demoTasks,
  demoUser,
} from "./fixtures";
import type { MockState } from "@/types/mock.type";
import type {
  HistoryResponse,
  LogRecord,
  OperationPlan,
  OperationSpec,
  Task,
} from "@/types/panel.type";

/** scenario 使用明确开发变量选择可复现异常，不在界面随机触发。 */
const scenario =
  (typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("scenario")
    : null) ??
  import.meta.env.VITE_MOCK_SCENARIO ??
  "normal";
/** state 不与任何真实 API 或浏览器持久存储混用。 */
const state: MockState = {
  authenticated: scenario !== "session-expired" && scenario !== "setup",
  initialized: scenario !== "setup",
  installations: structuredClone(scenario === "empty" ? [] : demoInstallations),
  apps: structuredClone(scenario === "empty" ? [] : demoApps),
  tasks: structuredClone(scenario === "empty" ? [] : demoTasks),
  plans: new Map(),
  idempotency: new Map(),
  sequence: 120,
  settings: {
    revision: "1",
    displayTimezone: "server",
    metricsRetentionHours: 24,
    taskRetentionDays: 30,
    auditRetentionDays: 30,
    storageBytes: 12845056,
    runtimeRoot: demoSystem.runtimeRoot,
    version: "1.1.0-demo",
  },
};
/** listeners 仅用于浏览器内演示任务状态推送。 */
const listeners = new Set<(name: string, payload: unknown) => void>();
/** csrf 是演示用固定值，真实 Cookie 安全在后端独立验证。 */
const csrf = "demo-csrf-not-a-real-token";

/** ok 包装与真实接口一致的成功外壳。 */
function ok(data: unknown, status = 200) {
  return HttpResponse.json(
    {
      success: true,
      data,
      error: null,
      meta: { requestId: "demo-request", serverTime: DEMO_TIME },
    },
    { status },
  );
}
/** error 返回可重现错误，不构造伪成功状态。 */
function error(code: string, message: string, status = 422) {
  return HttpResponse.json(
    {
      success: false,
      data: null,
      error: { code, message },
      meta: { requestId: "demo-request", serverTime: DEMO_TIME },
    },
    { status },
  );
}
/** capabilities 对无权限和不支持平台场景禁用真实意义的写动作。 */
function capabilities() {
  const result = structuredClone(demoCapabilities);
  if (["unsupported", "permission-denied"].includes(scenario)) {
    const blocked = {
      enabled: false,
      reasonCode:
        scenario === "unsupported" ? "UNSUPPORTED_PLATFORM" : "FORBIDDEN",
      message:
        scenario === "unsupported"
          ? "测试平台不支持安装或 systemd"
          : "测试账号没有管理权限",
    };
    result.installRuntime = blocked;
    result.changeRuntimeDefault = blocked;
    result.uninstallRuntime = blocked;
    result.manageApps = blocked;
  }
  return result;
}
/** metrics 保留过期、首次采样和正常零值的差异。 */
function metrics() {
  const sample = structuredClone(demoMetrics);
  if (scenario === "stale") sample.sampledAt = "2026-09-28T14:20:00Z";
  if (scenario === "warming-up") {
    sample.cpuUsagePercent = {
      value: null,
      quality: "warming-up",
      reasonCode: "FIRST_SAMPLE",
    };
  }
  sample.sequence = state.sequence;
  return sample;
}
/** broadcast 为演示事件使用单调序号。 */
function broadcast(name: string, payload: unknown) {
  state.sequence++;
  for (const listener of listeners) listener(name, payload);
}
/** logRecords 包含足够固定数据测试虚拟列表与截断提示。 */
function logRecords(sourceId: string): LogRecord[] {
  const count = scenario === "log-flood" ? 500 : 24;
  return Array.from({ length: count }, (_, index) => ({
    id: `${sourceId}:${index + 1}`,
    sourceId,
    at: new Date(Date.parse(DEMO_TIME) - (count - index) * 2000).toISOString(),
    level: index === 8 ? "warn" : index === 16 ? "error" : "info",
    message:
      index === 16
        ? "示例：连接暂时不可用，下一次采样将重试"
        : index === 8
          ? "示例：目录请求超时，保留缓存结果"
          : `示例日志 ${index + 1} · 本机状态采集完成`,
    truncated: false,
  }));
}
/** history 使用固定函数生成可重现趋势，并保留历史不足范围。 */
function history(url: URL): HistoryResponse {
  const metric = url.searchParams.get("metric") ?? "cpu";
  const step = Number(url.searchParams.get("stepSeconds") ?? 10);
  const requested = Date.parse(url.searchParams.get("from") ?? DEMO_TIME);
  const end = Date.parse(DEMO_TIME);
  const start = Math.max(
    requested,
    end - (scenario === "history-short" ? 480000 : 3600000),
  );
  const count = Math.min(600, Math.floor((end - start) / (step * 1000)));
  const unit =
    metric.startsWith("network") || metric.startsWith("disk.")
      ? "bytes-per-second"
      : "percent";
  return {
    metric,
    unit,
    deviceId: url.searchParams.get("deviceId") || null,
    stepSeconds: step,
    availableFrom: new Date(start).toISOString(),
    points: Array.from({ length: Math.max(0, count) }, (_, index) => {
      const avg =
        unit === "percent"
          ? metric === "memory"
            ? 42.5 + Math.sin(index / 20) * 2
            : metric === "disk"
              ? 36
              : 18 + Math.sin(index / 9) * 7 + Math.sin(index / 3) * 3
          : (metric.endsWith("tx") ? 131072 : 1258291) *
            (1 + Math.sin(index / 11) * 0.25);
      const gap = index === 50 && scenario === "stale";
      return {
        at: new Date(start + index * step * 1000).toISOString(),
        avg: gap ? null : avg,
        min: gap ? null : avg * 0.9,
        max: gap ? null : avg * 1.1,
        sampleCount: gap ? 0 : 5,
      };
    }),
  };
}
/** planFor 对外部安装、引用和环境能力提供真实含义的阻止原因。 */
function planFor(operation: OperationSpec): OperationPlan {
  const blocked: OperationPlan["blockedReasons"] = [];
  const id = `plan-${state.plans.size + 1}`;
  let summary = "核对操作后创建后台任务";
  let confirmationText: string | null = null;
  const resourceIds: string[] = [];
  if (["permission-denied", "unsupported"].includes(scenario))
    blocked.push({ code: "FORBIDDEN", message: "当前演示场景不允许此操作" });
  if (operation.action.startsWith("runtime.")) {
    summary =
      operation.action === "runtime.install"
        ? "隔离安装新版本，保留旧版本与现有应用绑定"
        : operation.action === "runtime.set-default"
          ? "只改变后续新建应用的默认预选，不修改系统 PATH"
          : "仅移除该面板管理安装目录，保留应用文件与日志";
    if ("installationId" in operation) {
      resourceIds.push(operation.installationId);
      const item = state.installations.find(
        (entry) => entry.id === operation.installationId,
      );
      if (!item)
        blocked.push({ code: "RESOURCE_NOT_FOUND", message: "安装不存在" });
      else {
        if (item.ownership === "external")
          blocked.push({
            code: "EXTERNAL_INSTALL_READ_ONLY",
            message: "外部安装仅供查看",
          });
        if (operation.action === "runtime.uninstall") {
          confirmationText = item.version;
          if (
            item.isPanelDefault ||
            item.configuredAppRefs > 0 ||
            (item.observedProcessRefs ?? 1) > 0 ||
            scenario === "in-use"
          )
            blocked.push({
              code: "VERSION_IN_USE",
              message: "版本仍是默认或被应用/进程引用，请先解除引用",
            });
        }
      }
    }
    if (scenario === "disk-full")
      blocked.push({
        code: "DISK_SPACE_INSUFFICIENT",
        message: "磁盘空间不足，尚未开始安装",
      });
    if (scenario === "offline")
      blocked.push({
        code: "DOWNLOAD_FAILED",
        message: "无网络且不存在经过验证的缓存安装包",
      });
  } else {
    summary =
      operation.action === "app.create"
        ? "创建托管配置，应用不会自动启动"
        : operation.action === "app.update"
          ? "保存配置，在下次启动时生效"
          : operation.action === "app.delete"
            ? "移除已停止应用的托管配置，保留文件和日志"
            : "改变该应用的运行状态，可能中断正在处理的请求";
    if ("appId" in operation) {
      resourceIds.push(operation.appId);
      const app = state.apps.find((entry) => entry.id === operation.appId);
      if (operation.action === "app.delete" && app?.status !== "stopped")
        blocked.push({
          code: "RESOURCE_BUSY",
          message: "只有已停止应用可以删除",
        });
    }
  }
  return {
    id,
    action: operation.action,
    expiresAt: new Date(Date.parse(DEMO_TIME) + 60000).toISOString(),
    summary,
    warnings: [],
    blockedReasons: blocked,
    resourceIds,
    confirmationText,
    canExecute: !blocked.length,
    details:
      operation.action === "runtime.install"
        ? [
            { label: "目标版本", value: operation.releaseId },
            { label: "安装根目录", value: demoSystem.runtimeRoot },
            { label: "来源与校验", value: "官方 HTTPS 目录 · SHA-256（演示）" },
            { label: "空间要求", value: "安装卷至少 3 GiB 可用" },
          ]
        : [
            {
              label: "操作目标",
              value:
                "appId" in operation
                  ? operation.appId
                  : "installationId" in operation
                    ? operation.installationId
                    : "app" in operation
                      ? operation.app.name
                      : "当前资源",
            },
          ],
  };
}
/** applyOperation 只更新演示资源，不触达宿主机文件或服务。 */
function applyOperation(operation: OperationSpec) {
  if (operation.action === "runtime.install") {
    const release = demoReleases.find(
      (entry) => entry.id === operation.releaseId,
    );
    if (release) {
      if (operation.makeDefault)
        state.installations.forEach((item) => {
          if (item.kind === release.kind) item.isPanelDefault = false;
        });
      state.installations.push({
        id: `install-${state.sequence}`,
        kind: release.kind,
        version: release.version,
        architecture: "amd64",
        path: `${demoSystem.runtimeRoot}/${release.kind}/${release.version}/linux-amd64`,
        ownership: "panel",
        state: "ready",
        isPanelDefault: operation.makeDefault,
        configuredAppRefs: 0,
        observedProcessRefs: 0,
        referenceCheckComplete: true,
        installedAt: DEMO_TIME,
        revision: "1",
      });
    }
  }
  if (operation.action === "runtime.uninstall")
    state.installations = state.installations.filter(
      (item) => item.id !== operation.installationId,
    );
  if (operation.action === "runtime.set-default") {
    const target = state.installations.find(
      (item) => item.id === operation.installationId,
    );
    if (target)
      state.installations.forEach((item) => {
        if (item.kind === target.kind)
          item.isPanelDefault = item.id === target.id;
      });
  }
  if (operation.action === "app.create")
    state.apps.push({
      ...operation.app,
      id: `app-${state.sequence}`,
      revision: "1",
      unitName: `zx-panel-app-${state.sequence}.service`,
      status: "stopped",
      mainPid: null,
      startedAt: null,
      cpuUsagePercent: null,
      memoryBytes: null,
      environmentKeys: operation.environmentChanges
        .filter((item) => item.action === "set")
        .map((item) => ({ name: item.key, secret: true })),
      pendingRestart: false,
    });
  if ("appId" in operation) {
    const target = state.apps.find((item) => item.id === operation.appId);
    if (target) {
      target.revision = String(Number(target.revision) + 1);
      if (operation.action === "app.update") {
        Object.assign(target, operation.app);
        target.pendingRestart = target.status === "running";
      }
      if (
        operation.action === "app.start" ||
        operation.action === "app.restart"
      ) {
        target.status = "running";
        target.mainPid = 4321;
        target.pendingRestart = false;
        target.startedAt = DEMO_TIME;
      }
      if (operation.action === "app.stop") {
        target.status = "stopped";
        target.mainPid = null;
      }
      if (operation.action === "app.delete")
        state.apps = state.apps.filter((item) => item.id !== target.id);
    }
  }
}
/** createTask 演示同样区分受理与终态，失败不会改变资源。 */
function createTask(action: Task["action"], operation?: OperationSpec) {
  const task: Task = {
    id: `task-${state.tasks.length + 100}`,
    action,
    resourceIds: [],
    status: "queued",
    stage: "preflight",
    revision: 1,
    progress: { completedBytes: null, totalBytes: null },
    canCancel: true,
    cancelRequestedAt: null,
    createdAt: DEMO_TIME,
    startedAt: null,
    finishedAt: null,
    result: null,
    error: null,
  };
  state.tasks.unshift(task);
  setTimeout(() => {
    if (task.status !== "queued") return;
    task.status = "running";
    task.startedAt = DEMO_TIME;
    task.stage = action === "runtime.install" ? "download" : "execute";
    task.revision++;
    broadcast("task.updated", task);
  }, 300);
  setTimeout(() => {
    if (task.status !== "running") return;
    task.canCancel = false;
    task.finishedAt = DEMO_TIME;
    task.revision++;
    if (
      ["checksum-failure", "task-interrupted", "offline"].includes(scenario)
    ) {
      task.status = scenario === "task-interrupted" ? "interrupted" : "failed";
      task.error = {
        code:
          scenario === "checksum-failure"
            ? "CHECKSUM_MISMATCH"
            : "DOWNLOAD_FAILED",
        message: "演示任务未完成，请查看失败边界",
        recoverable: true,
      };
    } else {
      if (operation) applyOperation(operation);
      task.status = "succeeded";
      task.stage = "finalize";
      task.result =
        action === "logs.export"
          ? { exportId: "demo-export" }
          : { verified: true, demonstration: true };
    }
    broadcast("task.updated", task);
    broadcast("runtime.changed", {});
    broadcast("app.changed", {});
  }, 1800);
  return task;
}

/** handlers 统一请求适配，页面内部不散落伪数据。 */
export const handlers = [
  http.get("/api/v1/events", () => {
    if (!state.authenticated) return error("AUTH_REQUIRED", "会话已失效", 401);
    if (scenario === "stream-disconnected")
      return error("STREAM_UNAVAILABLE", "演示实时连接中断", 503);
    const encoder = new TextEncoder();
    let listener: ((name: string, payload: unknown) => void) | undefined;
    let heartbeat: ReturnType<typeof setInterval>;
    const stream = new ReadableStream({
      start(controller) {
        listener = (name, payload) => {
          controller.enqueue(
            encoder.encode(
              `id: demo:${state.sequence}\nevent: ${name}\ndata: ${JSON.stringify({ streamEpoch: "demo", payload })}\n\n`,
            ),
          );
        };
        listeners.add(listener);
        heartbeat = setInterval(() => listener?.("heartbeat", {}), 15000);
      },
      cancel() {
        if (listener) listeners.delete(listener);
        clearInterval(heartbeat);
      },
    });
    return new HttpResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
      },
    });
  }),
  http.get("/api/v1/logs/stream", ({ request }) => {
    if (!state.authenticated)
      return error("UNAUTHENTICATED", "演示会话已失效", 401);
    const sourceId =
      new URL(request.url).searchParams.get("sourceId") ?? "panel";
    const encoder = new TextEncoder();
    let interval: ReturnType<typeof setInterval> | undefined;
    let sequence = 500;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(": demo stream\n\n"));
        interval = setInterval(
          () => {
            const records: LogRecord[] =
              scenario === "log-flood"
                ? Array.from({ length: 250 }, () => ({
                    id: sourceId + ":live:" + ++sequence,
                    sourceId,
                    at: DEMO_TIME,
                    level: "info",
                    message: "高吞吐演示日志 " + sequence,
                    truncated: false,
                  }))
                : [];
            controller.enqueue(
              encoder.encode(
                "event: logs.batch\ndata: " +
                  JSON.stringify({
                    sourceId,
                    records,
                    cursor: "demo-tail-" + sequence,
                    droppedCount: 0,
                  }) +
                  "\n\n",
              ),
            );
          },
          scenario === "log-flood" ? 500 : 15000,
        );
      },
      cancel() {
        clearInterval(interval);
      },
    });
    return new HttpResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
      },
    });
  }),
  http.all("/api/v1/*", async ({ request: req }) => {
    await delay(100);
    const url = new URL(req.url);
    const path = url.pathname.slice("/api/v1".length);
    if (path === "/setup/status")
      return ok({ setupRequired: !state.initialized });
    if (path === "/auth/session")
      return ok({
        authenticated: state.authenticated,
        user: state.authenticated ? demoUser : null,
        csrfToken: csrf,
        expiresAt: state.authenticated ? "2026-09-29T02:24:00Z" : null,
      });
    if (path === "/auth/login") {
      state.authenticated = true;
      return ok({
        user: demoUser,
        csrfToken: csrf,
        expiresAt: "2026-09-29T02:24:00Z",
      });
    }
    if (path === "/auth/setup") {
      if (state.initialized) return error("FORBIDDEN", "已经初始化", 403);
      state.initialized = true;
      return ok({ initialized: true });
    }
    if (!state.authenticated) return error("AUTH_REQUIRED", "请重新登录", 401);
    if (path === "/auth/me") return ok({ user: demoUser });
    if (path === "/auth/logout" || path === "/auth/password") {
      state.authenticated = false;
      broadcast("auth.expired", {});
      return ok(
        path.endsWith("logout") ? { loggedOut: true } : { changed: true },
      );
    }
    if (path === "/bootstrap")
      return ok({
        system: demoSystem,
        capabilities: capabilities(),
        latestMetrics: metrics(),
        activeTasks: state.tasks.filter((task) =>
          ["running", "queued"].includes(task.status),
        ),
        streamCursor: `demo:${state.sequence}`,
        streamEpoch: "demo",
      });
    if (path === "/system/info") return ok(demoSystem);
    if (path === "/system/capabilities") return ok(capabilities());
    if (path === "/metrics/latest") return ok(metrics());
    if (path === "/metrics/history") return ok(history(url));
    if (path === "/runtimes")
      return ok(
        [
          ...new Set(["node", "go", ...state.installations.map((item) => item.kind)]),
        ].map((kind) => ({
          kind,
          defaultVersion:
            state.installations.find(
              (item) => item.kind === kind && item.isPanelDefault,
            )?.version ?? null,
          panelCount: state.installations.filter(
            (item) => item.kind === kind && item.ownership === "panel",
          ).length,
          externalCount: state.installations.filter(
            (item) => item.kind === kind && item.ownership === "external",
          ).length,
          externalVersions: [
            ...new Set(state.installations.filter(
              (item) => item.kind === kind && item.ownership === "external" && item.state === "ready",
            ).map((item) => item.version)),
          ],
          checkedAt: kind === "node" || kind === "go" ? DEMO_TIME : null,
          cacheState: kind !== "node" && kind !== "go"
            ? "unavailable"
            : scenario === "offline" ? "stale" : "fresh",
          updateAvailable: false,
        })),
      );
    if (/^\/runtimes\/(node|go|rust|python|java|php|ruby|dotnet|bun|deno)\/installations$/.test(path))
      return ok({
        items: state.installations
          .filter((item) => item.kind === path.split("/")[2])
          .map((item) =>
            scenario === "long-path"
              ? {
                  ...item,
                  path: item.path + "/" + "long-directory-".repeat(30),
                }
              : item,
          ),
        nextCursor: null,
      });
    if (/^\/runtimes\/(node|go)\/releases$/.test(path))
      return ok({
        items: demoReleases.filter((item) => item.kind === path.split("/")[2]),
        nextCursor: null,
        checkedAt: DEMO_TIME,
        cacheState: scenario === "offline" ? "stale" : "fresh",
      });
    if (
      path.startsWith("/runtime-installations/") &&
      path.endsWith("/references")
    ) {
      const id = path.split("/")[2];
      return ok({
        apps: state.apps.filter(
          (app) =>
            app.execution.kind === "node" &&
            app.execution.runtimeInstallationId === id,
        ),
        processes: [],
        complete: true,
        reason: null,
      });
    }
    if (path === "/apps") return ok({ items: state.apps, nextCursor: null });
    if (path.startsWith("/apps/")) {
      const app = state.apps.find((item) => item.id === path.split("/")[2]);
      return app ? ok(app) : error("RESOURCE_NOT_FOUND", "应用不存在", 404);
    }
    if (path === "/processes")
      return ok({
        items: state.apps
          .filter((app) => app.mainPid !== null)
          .filter(
            (app) =>
              !url.searchParams.get("search") ||
              app.name.includes(url.searchParams.get("search") ?? ""),
          )
          .map((app) => ({
            pid: app.mainPid,
            ppid: 1,
            startedAt: app.startedAt,
            processKey: `demo:${app.mainPid}:1`,
            name: app.name,
            user: "zx-app",
            cpuPercent: app.cpuUsagePercent,
            rssBytes: app.memoryBytes,
            appId: app.id,
          })),
        nextCursor: null,
      });
    if (path === "/tasks") return ok({ items: state.tasks, nextCursor: null });
    if (path.startsWith("/tasks/")) {
      const task = state.tasks.find((item) => item.id === path.split("/")[2]);
      if (!task) return error("RESOURCE_NOT_FOUND", "任务不存在", 404);
      if (path.endsWith("/logs"))
        return ok({
          items: logRecords(task.id),
          nextCursor: null,
          tailCursor: "demo:log:24",
        });
      if (path.endsWith("/cancel")) {
        if (task.canCancel) {
          task.status = "canceled";
          task.canCancel = false;
          task.cancelRequestedAt = DEMO_TIME;
          task.finishedAt = DEMO_TIME;
          task.revision++;
          broadcast("task.updated", task);
        }
      }
      return ok(task);
    }
    if (path === "/operations/preview") {
      const parsed = operationSchema.safeParse(await req.json());
      if (!parsed.success) return error("INVALID_INPUT", "动作字段不符合契约");
      const plan = planFor(parsed.data);
      state.plans.set(plan.id, { plan, operation: parsed.data });
      return ok(plan);
    }
    if (
      path === "/operations" ||
      path === "/runtimes/catalog/refresh" ||
      path === "/logs/exports"
    ) {
      const key = req.headers.get("Idempotency-Key");
      if (!key) return error("INVALID_INPUT", "缺少幂等键");
      const body = await req.text();
      const existing = state.idempotency.get(key);
      if (existing)
        return existing.body === body
          ? ok(
              state.tasks.find((task) => task.id === existing.taskId),
              202,
            )
          : error("IDEMPOTENCY_CONFLICT", "幂等键已被其他请求使用", 409);
      let task: Task;
      if (path === "/operations") {
        const parsed = z
          .object({
            planId: z.string(),
            confirmationText: z.string().nullable(),
          })
          .safeParse(JSON.parse(body));
        if (!parsed.success) return error("INVALID_INPUT", "缺少计划");
        const record = state.plans.get(parsed.data.planId);
        if (!record) return error("PLAN_EXPIRED", "预检已过期", 409);
        if (record.taskId)
          return ok(
            state.tasks.find((item) => item.id === record.taskId),
            202,
          );
        if (!record.plan.canExecute)
          return error("FORBIDDEN", "预检未通过", 403);
        if (scenario === "plan-expired")
          return error("PLAN_EXPIRED", "请重新预检", 409);
        if (record.plan.confirmationText !== parsed.data.confirmationText)
          return error("INVALID_INPUT", "确认文本不匹配");
        task = createTask(record.operation.action, record.operation);
        record.taskId = task.id;
      } else
        task = createTask(
          path.includes("catalog") ? "catalog.refresh" : "logs.export",
        );
      state.idempotency.set(key, { body, taskId: task.id });
      return ok(task, 202);
    }
    if (path === "/logs/sources")
      return ok([
        {
          id: "panel",
          label: "面板服务",
          capabilities: { stream: true, export: true },
        },
        {
          id: "audit",
          label: "操作审计",
          capabilities: { stream: true, export: true },
        },
        ...state.apps.map((app) => ({
          id: `app:${app.id}`,
          label: app.name,
          capabilities: { stream: true, export: true },
        })),
      ]);
    if (path === "/logs") {
      const source = url.searchParams.get("sourceId") ?? "panel";
      return ok({
        items: logRecords(source).filter(
          (line) =>
            (!url.searchParams.get("search") ||
              line.message.includes(url.searchParams.get("search") ?? "")) &&
            (!url.searchParams.get("level") ||
              url.searchParams.get("level") === "all" ||
              line.level === url.searchParams.get("level")),
        ),
        nextCursor: null,
        tailCursor: "demo:log:24",
      });
    }
    if (path.startsWith("/logs/exports/") && path.endsWith("/download"))
      return new HttpResponse("演示日志导出\n", {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": 'attachment; filename="zx-panel-demo.log"',
        },
      });
    if (path === "/settings") {
      if (req.method === "PATCH") {
        const values = z
          .object({
            expectedRevision: z.string(),
            displayTimezone: z.string(),
            metricsRetentionHours: z.number(),
            taskRetentionDays: z.number(),
            auditRetentionDays: z.number(),
          })
          .parse(await req.json());
        if (values.expectedRevision !== state.settings.revision)
          return error("REVISION_CONFLICT", "设置已改变，请重新读取", 409);
        state.settings = {
          ...state.settings,
          ...values,
          revision: String(Number(state.settings.revision) + 1),
        };
      }
      return ok(state.settings);
    }
    return error("RESOURCE_NOT_FOUND", "演示接口不存在", 404);
  }),
];
