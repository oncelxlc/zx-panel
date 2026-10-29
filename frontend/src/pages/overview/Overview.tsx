import { actionLabels } from "@/features/panel/navigation";
import { useDisplayTimezone } from "@/features/panel/display";
import { lazy, Suspense } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  Server,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToastNotice } from "@/features/panel/ToastNotice";
import { Skeleton } from "@/components/ui/skeleton";
import {
  bootstrapQuery,
  historyQuery,
  runtimesQuery,
  tasksQuery,
} from "@/features/panel/queries";
import { useLatestMetrics, useNow } from "@/features/panel/realtime";
import {
  Choice,
  MetricCard,
  PageHeading,
  QueryState,
  Status,
} from "@/features/panel/Shared";
import {
  formatBytes,
  formatDuration,
  formatPercent,
  formatTime,
  freshness,
} from "@/lib/format";
/** ResourceChart 按需拆包，不让所有路由承担图表依赖。 */
const ResourceChart = lazy(() =>
  import("@/features/panel/ResourceChart").then((module) => ({
    default: module.ResourceChart,
  })),
);
/** metricNames 只包含文档首发的四个总览指标。 */
const metricNames = {
  cpu: "CPU",
  memory: "内存",
  disk: "根分区",
  network: "网络下行",
};
/** OverviewPage 按读数、趋势、本机信息和可操作记录组织首屏。 */
export function OverviewPage() {
  const timeZone = useDisplayTimezone();
  const bootstrap = useQuery(bootstrapQuery);
  const metrics = useLatestMetrics();
  const runtimes = useQuery(runtimesQuery);
  const tasks = useQuery(tasksQuery);
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const tab =
    requested === "memory" || requested === "disk" || requested === "network"
      ? requested
      : "cpu";
  const range = params.get("range") ?? "1h";
  const anchor = new Date(Math.floor(now / 10_000) * 10_000).toISOString();
  const sample = metrics.data;
  const system = bootstrap.data?.system;
  const disk =
    sample?.filesystems.find((item) => item.mountPoint === "/") ??
    sample?.filesystems[0];
  const network =
    sample?.networks.find((item) => item.isPrimary) ?? sample?.networks[0];
  const history = useQuery({
    ...historyQuery(
      tab,
      tab === "disk"
        ? (disk?.id ?? "")
        : tab === "network"
          ? (network?.id ?? "")
          : "",
      range,
      import.meta.env.VITE_DATA_MODE === "mock"
        ? "2026-09-28T14:24:00Z"
        : anchor,
    ),
    refetchInterval: 10000,
  });
  const failed =
    tasks.data?.items.filter((item) =>
      ["failed", "interrupted"].includes(item.status),
    ) ?? [];
  /** 将非敏感筛选写入当前路由，保留任务抽屉参数。 */
  function filter(key: string, value: string) {
    setParams((previous) => {
      previous.set(key, value);
      return previous;
    });
  }
  return (
    <div className="page-stack">
      <PageHeading
        title="概览"
        description={<>当前服务器 · {system?.hostname ?? "读取本机信息…"}</>}
        action={
          sample && (
            <div className="flex flex-wrap items-center gap-2">
              <Status status={freshness(sample.sampledAt, now)} />
              <span className="text-xs text-muted-foreground">
                {formatTime(sample.sampledAt, timeZone)}
              </span>
            </div>
          )
        }
      />
      {failed.length > 0 && (
        <ToastNotice
          id="failed-tasks"
          type="warning"
          title={`${failed.length} 个任务需要处理`}
          actionLabel="查看失败原因"
          onAction={() => filter("task", failed[0].id)}
        />
      )}
      <QueryState
        pending={metrics.isPending}
        error={metrics.error}
        retry={() => void metrics.refetch()}
      >
        {sample && (
          <div className="metric-grid">
            <MetricCard
              title="CPU 使用率"
              icon={Cpu}
              value={formatPercent(sample.cpuUsagePercent)}
              detail={`${system?.logicalCpuCount ?? "—"} 逻辑核 · 负载 ${sample.loadAverage?.one.toFixed(2) ?? "—"}`}
              to="/monitoring?tab=cpu"
              quality={sample.cpuUsagePercent}
              sampledAt={sample.sampledAt}
            />
            <MetricCard
              title="内存使用率"
              icon={MemoryStick}
              value={formatPercent(sample.memory.usagePercent)}
              detail={`${formatBytes(sample.memory.usedBytes)} / ${formatBytes(sample.memory.totalBytes)}`}
              to="/monitoring?tab=memory"
              quality={sample.memory.usagePercent}
              sampledAt={sample.sampledAt}
            />
            <MetricCard
              title={`根分区 ${disk?.mountPoint ?? ""}`}
              icon={HardDrive}
              value={formatPercent(disk?.usagePercent)}
              detail={`${formatBytes(disk?.usedBytes)} / ${formatBytes(disk?.totalBytes)}`}
              percent={disk?.usagePercent.value}
              to="/monitoring?tab=disk"
              quality={disk?.usagePercent}
              sampledAt={disk?.sampledAt}
            />
            <MetricCard
              title="网络下行"
              icon={Network}
              value={formatBytes(network?.rxBytesPerSecond.value, true)}
              detail={`上行 ${formatBytes(network?.txBytesPerSecond.value, true)} · ${network?.name ?? "无可用网卡"}`}
              to="/monitoring?tab=network"
              quality={network?.rxBytesPerSecond}
              sampledAt={sample.sampledAt}
            />
          </div>
        )}
      </QueryState>
      <div className="overview-grid">
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              资源趋势
            </CardTitle>
            <CardDescription>真实采样 · 百分比与吞吐分开呈现</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Tabs
                value={tab}
                onValueChange={(value) => filter("tab", String(value))}
              >
                <TabsList>
                  {Object.entries(metricNames).map(([value, label]) => (
                    <TabsTrigger key={value} value={value}>
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <Choice
                label="范围"
                value={range}
                onChange={(value) => filter("range", value)}
                options={[
                  { value: "15m", label: "15 分钟" },
                  { value: "1h", label: "1 小时" },
                  { value: "24h", label: "24 小时" },
                ]}
              />
            </div>
            <QueryState
              pending={history.isPending}
              error={history.error}
              retry={() => void history.refetch()}
            >
              {history.data && (
                <Suspense fallback={<Skeleton className="h-60" />}>
                  <ResourceChart
                    history={history.data}
                    label={metricNames[tab]}
                    timeZone={timeZone}
                  />
                </Suspense>
              )}
            </QueryState>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              <span className="flex items-center gap-2">
                <Server aria-hidden="true" className="size-4" />
                本机信息
              </span>
            </CardTitle>
            <CardDescription>
              {system?.observationScope === "host"
                ? "面板所在服务器"
                : "仅展示已探测范围"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <QueryState
              pending={bootstrap.isPending}
              error={bootstrap.error}
              retry={() => void bootstrap.refetch()}
            >
              {system && (
                <dl className="detail-grid text-sm">
                  <dt>主机名</dt>
                  <dd>{system.hostname}</dd>
                  <dt>操作系统</dt>
                  <dd>
                    {system.os.name} {system.os.version}
                  </dd>
                  <dt>内核</dt>
                  <dd className="font-mono text-xs">
                    {system.os.kernel || "不可用"}
                  </dd>
                  <dt>架构</dt>
                  <dd>{system.architecture}</dd>
                  <dt>处理器</dt>
                  <dd>{system.cpuModel || "不可用"}</dd>
                  <dt>逻辑核数</dt>
                  <dd>{system.logicalCpuCount}</dd>
                  <dt>内存</dt>
                  <dd>{formatBytes(system.memoryTotalBytes)}</dd>
                  <dt>启动时间</dt>
                  <dd>{formatTime(system.bootedAt, timeZone)}</dd>
                  <dt>运行时长</dt>
                  <dd>{formatDuration(system.uptimeSeconds)}</dd>
                </dl>
              )}
            </QueryState>
          </CardContent>
        </Card>
      </div>
      <div className="overview-grid">
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              运行环境
            </CardTitle>
            <CardDescription>
              面板默认版本只影响后续新建应用的预选项
            </CardDescription>
          </CardHeader>
          <CardContent>
            <QueryState
              pending={runtimes.isPending}
              error={runtimes.error}
              retry={() => void runtimes.refetch()}
            >
              <ItemGroup>
                {runtimes.data?.map((item) => (
                  <Item
                    key={item.kind}
                    variant="outline"
                    render={<Link to={`/runtimes/${item.kind}`} />}
                  >
                    <ItemContent>
                      <ItemTitle>
                        {item.kind === "node" ? "Node.js" : "Go 工具链"}
                      </ItemTitle>
                      <ItemDescription>
                        {item.defaultVersion
                          ? `默认 ${item.defaultVersion}`
                          : "未设置面板默认"}{" "}
                        · {item.panelCount} 个管理安装
                        {item.externalCount > 0
                          ? ` · ${item.externalCount} 个外部发现`
                          : ""}
                      </ItemDescription>
                    </ItemContent>
                    <span className="flex items-center gap-2 text-sm">
                      管理版本
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </span>
                  </Item>
                ))}
              </ItemGroup>
            </QueryState>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              近期任务
            </CardTitle>
            <CardDescription>失败与进行中的任务优先显示</CardDescription>
          </CardHeader>
          <CardContent>
            <QueryState
              pending={tasks.isPending}
              error={tasks.error}
              retry={() => void tasks.refetch()}
            >
              <ItemGroup>
                {tasks.data?.items.slice(0, 3).map((task) => (
                  <Item
                    key={task.id}
                    size="sm"
                    render={
                      <button
                        type="button"
                        onClick={() => filter("task", task.id)}
                      />
                    }
                  >
                    <ItemContent>
                      <ItemTitle>
                        {actionLabels[task.action] ?? task.action}
                      </ItemTitle>
                      <ItemDescription>
                        {formatTime(task.createdAt, timeZone)}
                      </ItemDescription>
                    </ItemContent>
                    <Status status={task.status} />
                  </Item>
                ))}
                {tasks.data?.items.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    暂无任务。操作记录将在受理后出现。
                  </p>
                )}
              </ItemGroup>
            </QueryState>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
