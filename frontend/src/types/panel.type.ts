/** ISODateTime 定义服务端与页面之间的业务契约；可空字段不得替换为伪造零值。 */
export type ISODateTime = string;
/** ManagedRuntimeKind 限定已有官方安装、默认版本与卸载能力的类别。 */
export type ManagedRuntimeKind = "node" | "go";
/** RuntimeKind 同时包含面板管理类别与只读系统工具链。 */
export type RuntimeKind =
  | ManagedRuntimeKind
  | "rust"
  | "python"
  | "java"
  | "php"
  | "ruby"
  | "dotnet"
  | "bun"
  | "deno";
/** ThemePreference 定义服务端与页面之间的业务契约；可空字段不得替换为伪造零值。 */
export type ThemePreference = "light" | "dark" | "system";
/** DataQuality 定义服务端与页面之间的业务契约；可空字段不得替换为伪造零值。 */
export type DataQuality = "ok" | "warming-up" | "unavailable";

/** ApiMeta 定义服务端与页面之间的业务契约；可空字段不得替换为伪造零值。 */
export interface ApiMeta {
  requestId: string;
  serverTime: ISODateTime;
}

/** Capability 定义服务端与页面之间的业务契约；可空字段不得替换为伪造零值。 */
export interface Capability {
  enabled: boolean;
  reasonCode: string | null;
  message: string | null;
}

/** SystemCapabilities 定义服务端与页面之间的业务契约；可空字段不得替换为伪造零值。 */
export interface SystemCapabilities {
  readMetrics: Capability;
  installRuntime: Capability;
  changeRuntimeDefault: Capability;
  uninstallRuntime: Capability;
  manageApps: Capability;
  readProcesses: Capability;
  readLogs: Capability;
  exportLogs: Capability;
  editSettings: Capability;
}

/** SystemInfo 定义服务端与页面之间的业务契约；可空字段不得替换为伪造零值。 */
export interface SystemInfo {
  hostname: string;
  os: { name: string; version: string; kernel: string };
  architecture: string;
  libc: { family: string; version: string | null } | null;
  cpuModel: string | null;
  logicalCpuCount: number;
  memoryTotalBytes: number | null;
  bootId: string;
  bootedAt: ISODateTime | null;
  uptimeSeconds: number | null;
  serverTimezone: string;
  observationScope: "host" | "container" | "restricted";
  appSupervisor: "systemd" | "none";
  runtimeRoot: string;
  appRoots: string[];
  serviceAccounts: string[];
}

/** MetricValue 定义服务端与页面之间的业务契约；可空字段不得替换为伪造零值。 */
export interface MetricValue {
  value: number | null;
  quality: DataQuality;
  reasonCode: string | null;
}

/** MetricSnapshot 定义服务端与页面之间的业务契约；可空字段不得替换为伪造零值。 */
export interface MetricSnapshot {
  sampledAt: ISODateTime;
  bootId: string;
  sequence: number;
  intervalMs: number;
  cpuUsagePercent: MetricValue;
  cpuPerCorePercent: MetricValue[];
  loadAverage: { one: number; five: number; fifteen: number } | null;
  memory: {
    totalBytes: number | null;
    usedBytes: number | null;
    availableBytes: number | null;
    cachedBytes?: number | null;
    usagePercent: MetricValue;
    swapTotalBytes: number | null;
    swapUsedBytes: number | null;
  };
  filesystems: Array<{
    id: string;
    mountPoint: string;
    sampledAt: ISODateTime; // 文件系统容量实际采集时间，不复用快照发送时间。
    totalBytes: number | null;
    usedBytes: number | null;
    freeBytes: number | null;
    availableBytes: number | null;
    usagePercent: MetricValue;
  }>;
  blockDevices: Array<{
    id: string;
    name: string;
    readBytesPerSecond: MetricValue;
    writeBytesPerSecond: MetricValue;
  }>;
  networks: Array<{
    id: string;
    name: string;
    isPrimary: boolean;
    rxBytesPerSecond: MetricValue;
    txBytesPerSecond: MetricValue;
    rxTotalBytes: string | null;
    txTotalBytes: string | null;
  }>;
}

/** HistoryResponse 定义服务端与页面之间的业务契约；可空字段不得替换为伪造零值。 */
export interface HistoryResponse {
  metric: string;
  unit: "percent" | "bytes" | "bytes-per-second" | "load";
  deviceId: string | null;
  stepSeconds: number;
  availableFrom: ISODateTime | null;
  points: Array<{
    at: ISODateTime;
    avg: number | null;
    min: number | null;
    max: number | null;
    sampleCount: number;
  }>;
}

/** RuntimeInstallation 定义服务端与页面之间的业务契约；可空字段不得替换为伪造零值。 */
export interface RuntimeInstallation {
  id: string;
  kind: RuntimeKind;
  version: string;
  architecture: string;
  path: string;
  ownership: "panel" | "external";
  state: "ready" | "broken" | "incompatible" | "unknown";
  isPanelDefault: boolean;
  configuredAppRefs: number;
  observedProcessRefs: number | null;
  referenceCheckComplete: boolean;
  installedAt: ISODateTime | null;
  revision: string;
}

/** RuntimeRelease 定义服务端与页面之间的业务契约；可空字段不得替换为伪造零值。 */
export interface RuntimeRelease {
  id: string;
  kind: ManagedRuntimeKind;
  version: string;
  channel: "lts" | "current" | "stable" | "prerelease" | "unknown";
  maintenance: "supported" | "eol" | "unknown";
  platform: string;
  downloadBytes: number | null;
  installedBytesEstimate: number | null;
  compatible: boolean;
  incompatibilityReason: string | null;
  verifiedArtifactCached: boolean;
}

/** AppExecution 定义服务端与页面之间的业务契约；可空字段不得替换为伪造零值。 */
export type AppExecution =
  | {
      kind: "node";
      runtimeInstallationId: string;
      entryFile: string;
      args: string[];
    }
  | {
      kind: "binary";
      executablePath: string;
      args: string[];
      buildToolchainLabel: string | null; // 说明信息，不代表运行期依赖。
    };

/** AppDraft 定义服务端与页面之间的业务契约；可空字段不得替换为伪造零值。 */
export interface AppDraft {
  name: string;
  workingDirectory: string;
  runAsUser: string;
  execution: AppExecution;
  restartPolicy: "no" | "on-failure";
}

/** ManagedApp 定义服务端与页面之间的业务契约；可空字段不得替换为伪造零值。 */
export interface ManagedApp extends AppDraft {
  id: string;
  revision: string;
  unitName: string;
  status:
    "running" | "stopped" | "starting" | "stopping" | "failed" | "unknown";
  mainPid: number | null;
  startedAt: ISODateTime | null;
  cpuUsagePercent: number | null; // 以单核为 100%，可超过 100%。
  memoryBytes: number | null; // 应用 cgroup 占用；不伪装成单进程 RSS。
  environmentKeys: Array<{ name: string; secret: boolean }>;
  pendingRestart: boolean;
}

/** EnvironmentChange 定义服务端与页面之间的业务契约；可空字段不得替换为伪造零值。 */
export type EnvironmentChange =
  | { action: "set"; key: string; value: string; secret: boolean }
  | { action: "remove"; key: string };

/** OperationSpec 定义服务端与页面之间的业务契约；可空字段不得替换为伪造零值。 */
export type OperationSpec =
  | { action: "runtime.install"; releaseId: string; makeDefault: boolean }
  | {
      action: "runtime.set-default";
      installationId: string;
      expectedRevision: string;
    }
  | {
      action: "runtime.uninstall";
      installationId: string;
      expectedRevision: string;
    }
  | {
      action: "app.create";
      app: AppDraft;
      environmentChanges: EnvironmentChange[];
    }
  | {
      action: "app.update";
      appId: string;
      expectedRevision: string;
      app: AppDraft;
      environmentChanges: EnvironmentChange[];
    }
  | {
      action: "app.start" | "app.stop" | "app.restart" | "app.delete";
      appId: string;
      expectedRevision: string;
    };

/** OperationPlan 定义服务端与页面之间的业务契约；可空字段不得替换为伪造零值。 */
export interface OperationPlan {
  id: string;
  action: OperationSpec["action"];
  expiresAt: ISODateTime;
  resourceIds: string[];
  summary: string;
  warnings: Array<{ code: string; message: string }>;
  blockedReasons: Array<{ code: string; message: string }>;
  confirmationText: string | null;
  canExecute: boolean;
  details: {label:string;value:string}[];
}

/** Task 定义服务端与页面之间的业务契约；可空字段不得替换为伪造零值。 */
export interface Task {
  id: string;
  action: OperationSpec["action"] | "catalog.refresh" | "logs.export";
  resourceIds: string[];
  status:
    "queued" | "running" | "succeeded" | "failed" | "canceled" | "interrupted";
  stage: string;
  revision: number;
  progress: { completedBytes: number | null; totalBytes: number | null };
  canCancel: boolean;
  cancelRequestedAt: ISODateTime | null;
  createdAt: ISODateTime;
  startedAt: ISODateTime | null;
  finishedAt: ISODateTime | null;
  result: Record<string, unknown> | null;
  error: { code: string; message: string; recoverable: boolean } | null;
}

/** ProcessItem 定义服务端与页面之间的业务契约；可空字段不得替换为伪造零值。 */
export interface ProcessItem {
  pid: number;
  ppid: number;
  startedAt: ISODateTime;
  processKey: string; // 后端以 bootId + PID + 启动标识构成，避免 PID 复用。
  name: string;
  user: string | null;
  cpuPercent: number | null;
  rssBytes: number | null;
  appId: string | null;
}

/** LogRecord 定义服务端与页面之间的业务契约；可空字段不得替换为伪造零值。 */
export interface LogRecord {
  id: string;
  sourceId: string;
  at: ISODateTime;
  level: "debug" | "info" | "warn" | "error" | "unknown";
  message: string;
  truncated: boolean;
}

/** Page 用于普通资源分页；游标不是身份凭据。 */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Bootstrap 将首屏事实与实时流续接边界一起返回。 */
export interface Bootstrap {
  system: SystemInfo;
  capabilities: SystemCapabilities;
  latestMetrics: MetricSnapshot;
  activeTasks: Task[];
  streamCursor: string;
  streamEpoch: string;
}

/** RuntimeSummary 将安装实例和目录更新状态分开呈现。 */
export interface RuntimeSummary {
  kind: RuntimeKind;
  defaultVersion: string | null;
  panelCount: number;
  externalCount: number;
  externalVersions: string[];
  checkedAt: string | null;
  cacheState: "fresh" | "stale" | "unavailable";
  updateAvailable: boolean;
}

/** ReleasePage 在目录失败时仍能展示已缓存条目及其时间。 */
export interface ReleasePage extends Page<RuntimeRelease> {
  checkedAt: string | null;
  cacheState: "fresh" | "stale" | "unavailable";
}

/** References 是卸载确认依据；未完成扫描时不能推断无引用。 */
export interface References {
  apps: ManagedApp[];
  processes: ProcessItem[];
  complete: boolean;
  reason: string | null;
}

/** Settings 仅保存可通过面板调整的显示和保留偏好。 */
export interface PanelSettings {
  revision: string;
  displayTimezone: string;
  metricsRetentionHours: number;
  taskRetentionDays: number;
  auditRetentionDays: number;
  storageBytes: number;
  runtimeRoot: string;
  version: string;
}

/** LogSource 限定后端已授权的日志来源，不暴露任意文件读取入口。 */
export interface LogSource {
  id: string;
  label: string;
  capabilities: { stream: boolean; export: boolean };
}

/** LogPage 将历史翻页和实时续接游标分别命名。 */
export interface LogPage extends Page<LogRecord> {
  tailCursor: string | null;
}

/** LogBatch 是当前日志来源的批量流消息。 */
export interface LogBatch {
  sourceId: string;
  records: LogRecord[];
  cursor: string;
  droppedCount: number;
}

/** StreamState 区分传输状态与指标本身是否新鲜。 */
export type StreamState = "connecting" | "live" | "reconnecting" | "polling";
