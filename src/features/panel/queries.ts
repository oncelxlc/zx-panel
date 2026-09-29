import {
  QueryClient,
  queryOptions,
  keepPreviousData,
} from "@tanstack/react-query";
import { z } from "zod";
import { ApiError, request } from "@/lib/api/client";
import { getSession } from "@/auth/api";
import {
  appSchema,
  bootstrapSchema,
  capabilitiesSchema,
  historySchema,
  installationSchema,
  logPageSchema,
  logSourceSchema,
  pageSchema,
  processSchema,
  releasePageSchema,
  settingsSchema,
  summarySchema,
  taskSchema,
} from "@/lib/api/schemas";
/** queryClient 只缓存服务器事实，写请求不会自动重放。 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15000,
      refetchOnWindowFocus: false,
      retry: (count, error) =>
        count < 2 &&
        (!(error instanceof ApiError) ||
          error.status === 0 ||
          error.status >= 500),
    },
    mutations: { retry: false },
  },
});
/** sessionQuery 缓存最小身份信息，失效时由全局守卫处理。 */
export const sessionQuery = queryOptions({
  queryKey: ["session"],
  queryFn: ({ signal }) => getSession(signal),
  staleTime: 30000,
  retry: false,
});
/** setupStatusQuery 只读取初始化是否完成，不透露已有账号信息。 */
export const setupStatusQuery = queryOptions({
  queryKey: ["setup"],
  queryFn: ({ signal }) =>
    request("/setup/status", z.object({ setupRequired: z.boolean() }), {
      signal,
    }),
  retry: false,
});
/** bootstrapQuery 一次读取首屏事实和续传边界。 */
export const bootstrapQuery = queryOptions({
  queryKey: ["bootstrap"],
  queryFn: ({ signal }) => request("/bootstrap", bootstrapSchema, { signal }),
  staleTime: 60000,
});
/** capabilitiesQuery 为界面提供当前操作可用性。 */
export const capabilitiesQuery = queryOptions({
  queryKey: ["system", "capabilities"],
  queryFn: ({ signal }) =>
    request("/system/capabilities", capabilitiesSchema, { signal }),
  staleTime: 30000,
});
/** runtimesQuery 不混淆安装数量和应用运行状态。 */
export const runtimesQuery = queryOptions({
  queryKey: ["runtimes"],
  queryFn: ({ signal }) =>
    request("/runtimes", z.array(summarySchema), { signal }),
});
/** installationsQuery 按运行时缓存真实安装实例。 */
export function installationsQuery(kind: string, cursor = "") {
  return queryOptions({
    queryKey: ["runtimes", kind, "installations", cursor],
    queryFn: ({ signal }) =>
      request(
        `/runtimes/${kind}/installations?limit=200&cursor=${encodeURIComponent(cursor)}`,
        pageSchema(installationSchema),
        { signal },
      ),
  });
}
/** releasesQuery 目录缓存十分钟，手动检查时失效。 */
export function releasesQuery(kind: string, cursor = "") {
  return queryOptions({
    queryKey: ["runtimes", kind, "catalog", cursor],
    queryFn: ({ signal }) =>
      request(
        `/runtimes/${kind}/releases?cursor=${encodeURIComponent(cursor)}`,
        releasePageSchema,
        { signal },
      ),
    staleTime: 600000,
  });
}
/** appsQuery 缓存配置与已核实运行状态。 */
export const appsQuery = queryOptions({
  queryKey: ["apps"],
  queryFn: ({ signal }) =>
    request("/apps?limit=200", pageSchema(appSchema), { signal }),
});
/** appQuery 为详情页读取不透明资源 ID。 */
export function appQuery(id: string) {
  return queryOptions({
    queryKey: ["app", id],
    queryFn: ({ signal }) =>
      request(`/apps/${encodeURIComponent(id)}`, appSchema, { signal }),
  });
}
/** processesQuery 仅在进程视图可见时轮询共享快照。 */
export function processesQuery(search: string, sort: string, cursor: string) {
  const params = new URLSearchParams({ search, sort, cursor, limit: "50" });
  return queryOptions({
    queryKey: ["processes", search, sort, cursor],
    queryFn: ({ signal }) =>
      request(`/processes?${params}`, pageSchema(processSchema), { signal }),
    refetchInterval: 5000,
  });
}
/** tasksQuery 由 SSE 更新，断流才开启后备轮询。 */
export const tasksQuery = queryOptions({
  queryKey: ["tasks"],
  queryFn: ({ signal }) =>
    request("/tasks?limit=200", pageSchema(taskSchema), { signal }),
  staleTime: 0,
});
/** taskQuery 从 URL 恢复后台任务。 */
export function taskQuery(id: string) {
  return queryOptions({
    queryKey: ["task", id],
    queryFn: ({ signal }) =>
      request(`/tasks/${encodeURIComponent(id)}`, taskSchema, { signal }),
    enabled: !!id,
  });
}
/** settingsQuery 读取非秘密设置及修订号。 */
export const settingsQuery = queryOptions({
  queryKey: ["settings"],
  queryFn: ({ signal }) => request("/settings", settingsSchema, { signal }),
});
/** sourcesQuery 返回已授权日志源。 */
export const sourcesQuery = queryOptions({
  queryKey: ["logs", "sources"],
  queryFn: ({ signal }) =>
    request("/logs/sources", z.array(logSourceSchema), { signal }),
});
/** logsQuery 历史查询与实时尾游标不混用。 */
export function logsQuery(params: URLSearchParams) {
  const search = params.toString();
  return queryOptions({
    gcTime: 0,
    queryKey: ["logs", "history", search],
    queryFn: ({ signal }) =>
      request(`/logs?${search}`, logPageSchema, { signal }),
  });
}
/** historyQuery 以固定窗口请求不超过 600 个点的趋势。 */
export function historyQuery(
  metric: string,
  deviceId: string,
  range: string,
  anchor: string,
) {
  const end = new Date(anchor);
  const seconds = range === "24h" ? 86400 : range === "15m" ? 900 : 3600;
  const params = new URLSearchParams({
    metric,
    deviceId,
    from: new Date(end.getTime() - seconds * 1000).toISOString(),
    to: end.toISOString(),
    stepSeconds: seconds === 86400 ? "300" : seconds === 900 ? "2" : "10",
  });
  return queryOptions({
    queryKey: ["metrics", "history", metric, deviceId, range, anchor],
    gcTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      request(`/metrics/history?${params}`, historySchema, { signal }),
    enabled: Number.isFinite(end.getTime()),
  });
}
