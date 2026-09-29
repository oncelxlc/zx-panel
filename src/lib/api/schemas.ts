import { z } from "zod";

/** metricValueSchema 保留 null 与真实零值的区别。 */
export const metricValueSchema = z.object({
  value: z.number().finite().nullable(),
  quality: z.enum(["ok", "warming-up", "unavailable"]),
  reasonCode: z.string().nullable(),
});
/** dateSchema 验证接口中的 UTC 时间字符串。 */
export const dateSchema = z.iso.datetime({ offset: true });
/** bytesSchema 限制面向 JavaScript 的普通字节数为安全整数。 */
const bytesSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER)
  .nullable();
/** capabilitySchema 记录不能执行操作的具体原因。 */
export const capabilitySchema = z.object({
  enabled: z.boolean(),
  reasonCode: z.string().nullable(),
  message: z.string().nullable(),
});
/** capabilitiesSchema 约束前端可引用的能力键。 */
export const capabilitiesSchema = z.object({
  readMetrics: capabilitySchema,
  installRuntime: capabilitySchema,
  changeRuntimeDefault: capabilitySchema,
  uninstallRuntime: capabilitySchema,
  manageApps: capabilitySchema,
  readProcesses: capabilitySchema,
  readLogs: capabilitySchema,
  exportLogs: capabilitySchema,
  editSettings: capabilitySchema,
});
/** systemSchema 不允许用示例主机信息补全真实响应。 */
export const systemSchema = z.object({
  hostname: z.string(),
  os: z.object({ name: z.string(), version: z.string(), kernel: z.string() }),
  architecture: z.string(),
  libc: z
    .object({ family: z.string(), version: z.string().nullable() })
    .nullable(),
  cpuModel: z.string().nullable(),
  logicalCpuCount: z.number().int().nonnegative(),
  memoryTotalBytes: bytesSchema,
  bootId: z.string(),
  bootedAt: dateSchema.nullable(),
  uptimeSeconds: z.number().nonnegative().nullable(),
  serverTimezone: z.string(),
  observationScope: z.enum(["host", "container", "restricted"]),
  appSupervisor: z.enum(["systemd", "none"]),
  runtimeRoot: z.string(),
  appRoots: z.array(z.string()),
  serviceAccounts: z.array(z.string()),
});
/** snapshotSchema 校验整个实时样本，包括不同频率的文件系统时间。 */
export const snapshotSchema = z.object({
  sampledAt: dateSchema,
  bootId: z.string(),
  sequence: z.number().int().nonnegative(),
  intervalMs: z.number().nonnegative(),
  cpuUsagePercent: metricValueSchema,
  cpuPerCorePercent: z.array(metricValueSchema),
  loadAverage: z
    .object({ one: z.number(), five: z.number(), fifteen: z.number() })
    .nullable(),
  memory: z.object({
    totalBytes: bytesSchema,
    usedBytes: bytesSchema,
    availableBytes: bytesSchema,
    cachedBytes: bytesSchema.optional(),
    usagePercent: metricValueSchema,
    swapTotalBytes: bytesSchema,
    swapUsedBytes: bytesSchema,
  }),
  filesystems: z.array(
    z.object({
      id: z.string(),
      mountPoint: z.string(),
      sampledAt: dateSchema,
      totalBytes: bytesSchema,
      usedBytes: bytesSchema,
      freeBytes: bytesSchema,
      availableBytes: bytesSchema,
      usagePercent: metricValueSchema,
    }),
  ),
  blockDevices: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      readBytesPerSecond: metricValueSchema,
      writeBytesPerSecond: metricValueSchema,
    }),
  ),
  networks: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      isPrimary: z.boolean(),
      rxBytesPerSecond: metricValueSchema,
      txBytesPerSecond: metricValueSchema,
      rxTotalBytes: z.string().regex(/^\d+$/).nullable(),
      txTotalBytes: z.string().regex(/^\d+$/).nullable(),
    }),
  ),
});
/** installationSchema 区分归属、默认与安装状态。 */
export const installationSchema = z.object({
  id: z.string(),
  kind: z.enum(["node", "go"]),
  version: z.string(),
  architecture: z.string(),
  path: z.string(),
  ownership: z.enum(["panel", "external"]),
  state: z.enum(["ready", "broken", "incompatible", "unknown"]),
  isPanelDefault: z.boolean(),
  configuredAppRefs: z.number().int().nonnegative(),
  observedProcessRefs: z.number().int().nonnegative().nullable(),
  referenceCheckComplete: z.boolean(),
  installedAt: dateSchema.nullable(),
  revision: z.string(),
});
/** releaseSchema 只接受后端已规范化的发布通道。 */
export const releaseSchema = z
  .object({
    id: z.string(),
    kind: z.enum(["node", "go"]),
    version: z.string(),
    channel: z.enum(["lts", "current", "stable", "prerelease", "unknown"]),
    maintenance: z.enum(["supported", "eol", "unknown"]),
    platform: z.string(),
    downloadBytes: bytesSchema,
    installedBytesEstimate: bytesSchema,
    compatible: z.boolean(),
    incompatibilityReason: z.string().nullable(),
    verifiedArtifactCached: z.boolean(),
  })
  .refine(
    (value) => value.kind !== "go" || value.channel !== "lts",
    "Go 工具链没有 LTS 标签",
  );
/** executionSchema 保留 Node 与二进制两种明确执行配置。 */
export const executionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("node"),
    runtimeInstallationId: z.string(),
    entryFile: z.string(),
    args: z.array(z.string()),
  }),
  z.object({
    kind: z.literal("binary"),
    executablePath: z.string(),
    args: z.array(z.string()),
    buildToolchainLabel: z.string().nullable(),
  }),
]);
/** appSchema 不接收任何环境变量明文值。 */
export const appSchema = z.object({
  id: z.string(),
  revision: z.string(),
  name: z.string(),
  workingDirectory: z.string(),
  runAsUser: z.string(),
  execution: executionSchema,
  restartPolicy: z.enum(["no", "on-failure"]),
  unitName: z.string(),
  status: z.enum([
    "running",
    "stopped",
    "starting",
    "stopping",
    "failed",
    "unknown",
  ]),
  mainPid: z.number().int().nullable(),
  startedAt: dateSchema.nullable(),
  cpuUsagePercent: z.number().nonnegative().nullable(),
  memoryBytes: bytesSchema,
  environmentKeys: z.array(z.object({ name: z.string(), secret: z.boolean() })),
  pendingRestart: z.boolean(),
});
/** taskSchema 约束任务状态与真实下载进度。 */
export const taskSchema = z.object({
  id: z.string(),
  action: z.enum([
    "runtime.install",
    "runtime.set-default",
    "runtime.uninstall",
    "app.create",
    "app.update",
    "app.start",
    "app.stop",
    "app.restart",
    "app.delete",
    "catalog.refresh",
    "logs.export",
  ]),
  resourceIds: z.array(z.string()),
  status: z.enum([
    "queued",
    "running",
    "succeeded",
    "failed",
    "canceled",
    "interrupted",
  ]),
  stage: z.string(),
  revision: z.number().int().positive(),
  progress: z.object({ completedBytes: bytesSchema, totalBytes: bytesSchema }),
  canCancel: z.boolean(),
  cancelRequestedAt: dateSchema.nullable(),
  createdAt: dateSchema,
  startedAt: dateSchema.nullable(),
  finishedAt: dateSchema.nullable(),
  result: z.record(z.string(), z.unknown()).nullable(),
  error: z
    .object({ code: z.string(), message: z.string(), recoverable: z.boolean() })
    .nullable(),
});
/** noticeSchema 是公开预检说明，不携带内部异常或秘密。 */
const noticeSchema = z.object({ code: z.string(), message: z.string() });
/** planSchema 校验预检的影响、确认文本和有效期。 */
export const planSchema = z.object({
  id: z.string(),
  action: z.enum([
    "runtime.install",
    "runtime.set-default",
    "runtime.uninstall",
    "app.create",
    "app.update",
    "app.start",
    "app.stop",
    "app.restart",
    "app.delete",
  ]),
  expiresAt: dateSchema,
  resourceIds: z.array(z.string()),
  summary: z.string(),
  warnings: z.array(noticeSchema),
  blockedReasons: z.array(noticeSchema),
  confirmationText: z.string().nullable(),
  canExecute: z.boolean(),
  details: z.array(z.object({label:z.string(),value:z.string()})).default([]),
});
/** processSchema 将进程启动身份与 PID 一同验证。 */
export const processSchema = z.object({
  pid: z.number().int().positive(),
  ppid: z.number().int().nonnegative(),
  startedAt: dateSchema,
  processKey: z.string(),
  name: z.string(),
  user: z.string().nullable(),
  cpuPercent: z.number().nullable(),
  rssBytes: bytesSchema,
  appId: z.string().nullable(),
});
/** logSchema 保留服务端截断标识，日志消息只能作为文本展示。 */
export const logSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  at: dateSchema,
  level: z.enum(["debug", "info", "warn", "error", "unknown"]),
  message: z.string(),
  truncated: z.boolean(),
});
/** pageSchema 统一资源列表与下一页游标。 */
export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}
/** bootstrapSchema 将首屏资源与 SSE 衔接边界一起校验。 */
export const bootstrapSchema = z.object({
  system: systemSchema,
  capabilities: capabilitiesSchema,
  latestMetrics: snapshotSchema,
  activeTasks: z.array(taskSchema),
  streamCursor: z.string(),
  streamEpoch: z.string(),
});
/** historySchema 校验缺口、峰值与实际采集覆盖范围。 */
export const historySchema = z.object({
  metric: z.string(),
  unit: z.enum(["percent", "bytes", "bytes-per-second", "load"]),
  deviceId: z.string().nullable(),
  stepSeconds: z.number().positive(),
  availableFrom: dateSchema.nullable(),
  points: z
    .array(
      z.object({
        at: dateSchema,
        avg: z.number().nullable(),
        min: z.number().nullable(),
        max: z.number().nullable(),
        sampleCount: z.number().int().nonnegative(),
      }),
    )
    .max(600),
});
/** summarySchema 区分目录缓存状态与已安装版本摘要。 */
export const summarySchema = z.object({
  kind: z.enum(["node", "go"]),
  defaultVersion: z.string().nullable(),
  panelCount: z.number().int(),
  externalCount: z.number().int(),
  checkedAt: dateSchema.nullable(),
  cacheState: z.enum(["fresh", "stale", "unavailable"]),
  updateAvailable: z.boolean(),
});
/** releasePageSchema 保留目录失败后的缓存时间。 */
export const releasePageSchema = pageSchema(releaseSchema).extend({
  checkedAt: dateSchema.nullable(),
  cacheState: z.enum(["fresh", "stale", "unavailable"]),
});
/** settingsSchema 防止秘密配置混入设置表单。 */
export const settingsSchema = z.object({
  revision: z.string(),
  displayTimezone: z.string(),
  metricsRetentionHours: z.number().int(),
  taskRetentionDays: z.number().int(),
  auditRetentionDays: z.number().int(),
  storageBytes: z.number().nonnegative(),
  runtimeRoot: z.string(),
  version: z.string(),
});
/** logSourceSchema 使用受限来源 ID 代替任意文件路径。 */
export const logSourceSchema = z.object({
  id: z.string(),
  label: z.string(),
  capabilities: z.object({ stream: z.boolean(), export: z.boolean() }),
});
/** logPageSchema 分别提供历史和实时游标。 */
export const logPageSchema = pageSchema(logSchema).extend({
  tailCursor: z.string().nullable(),
});
