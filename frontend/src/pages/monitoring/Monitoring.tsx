import { useDisplayTimezone } from "@/features/panel/display";
import { lazy, Suspense, useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { historyQuery } from "@/features/panel/queries";
import { useLatestMetrics, useNow } from "@/features/panel/realtime";
import {
  Choice,
  DataTable,
  PageHeading,
  QueryState,
  Status,
} from "@/features/panel/Shared";
import {
  formatBytes,
  formatPercent,
  formatTime,
  freshness,
} from "@/lib/format";
import type { MetricSnapshot } from "@/types/panel.type";
/** ResourceChart 独立分包，暂停显示时不停止后台采集。 */
const ResourceChart = lazy(() =>
  import("@/features/panel/ResourceChart").then((module) => ({
    default: module.ResourceChart,
  })),
);
/** tabs 指定监控页唯一的指标分组。 */
const tabs = [
  { value: "cpu", label: "CPU" },
  { value: "memory", label: "内存" },
  { value: "disk", label: "磁盘" },
  { value: "network", label: "网络" },
];
/** MonitoringPage 按单位和设备分组展示真实历史及采集质量。 */
export function MonitoringPage() {
  const timeZone = useDisplayTimezone();
  const [params, setParams] = useSearchParams();
  const query = useLatestMetrics();
  const now = useNow();
  const [frozen, setFrozen] = useState<MetricSnapshot | null>(null);
  const anchor = new Date(
    Math.floor((frozen ? Date.parse(frozen.sampledAt) : now) / 10_000) * 10_000,
  ).toISOString();
  const sample = frozen ?? query.data;
  const tab = tabs.some((item) => item.value === params.get("tab"))
    ? (params.get("tab") ?? "cpu")
    : "cpu";
  const range = params.get("range") ?? "1h";
  const options =
    tab === "disk"
      ? (sample?.filesystems.map((item) => ({
          value: item.id,
          label: item.mountPoint,
        })) ?? [])
      : (sample?.networks.map((item) => ({
          value: item.id,
          label: item.name + (item.isPrimary ? " · 主路由" : ""),
        })) ?? []);
  const device = options.some((item) => item.value === params.get("device"))
    ? (params.get("device") ?? "")
    : tab === "network"
      ? (sample?.networks.find((item) => item.isPrimary)?.id ??
        options[0]?.value ??
        "")
      : (options[0]?.value ?? "");
  const end =
    import.meta.env.VITE_DATA_MODE === "mock" ? "2026-09-28T14:24:00Z" : anchor;
  const history = useQuery({
    ...historyQuery(
      tab,
      tab === "disk" || tab === "network" ? device : "",
      range,
      end,
    ),
    enabled: !frozen,
    refetchInterval: frozen ? false : 10000,
  });
  const upload = useQuery({
    ...historyQuery("network.tx", device, range, end),
    enabled: tab === "network" && !frozen,
    refetchInterval: tab === "network" && !frozen ? 10000 : false,
  });
  const ioDevice = sample?.blockDevices.some(
    (item) => item.id === params.get("block"),
  )
    ? (params.get("block") ?? "")
    : (sample?.blockDevices[0]?.id ?? "");
  const diskRead = useQuery({
    ...historyQuery("disk.read", ioDevice, range, end),
    enabled: tab === "disk" && !!ioDevice && !frozen,
    refetchInterval: tab === "disk" && !frozen ? 10000 : false,
  });
  const diskWrite = useQuery({
    ...historyQuery("disk.write", ioDevice, range, end),
    enabled: tab === "disk" && !!ioDevice && !frozen,
    refetchInterval: tab === "disk" && !frozen ? 10000 : false,
  });
  /** 标签和设备写入非敏感 URL；切换分组时清除旧设备。 */
  function filter(key: string, value: string) {
    setParams((previous) => {
      previous.set(key, value);
      if (key === "tab") previous.delete("device");
      return previous;
    });
  }
  return (
    <div className="page-stack">
      <PageHeading
        title="监控"
        description={
          frozen
            ? "显示已暂停，服务器仍按原策略采集"
            : "共享本机采集器 · 缺口和不可用数据保留真实状态"
        }
        action={
          <>
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
            <Button
              variant="outline"
              onClick={() => setFrozen(frozen ? null : (query.data ?? null))}
              disabled={!query.data}
            >
              {frozen ? (
                <Play data-icon="inline-start" />
              ) : (
                <Pause data-icon="inline-start" />
              )}
              {frozen ? "恢复显示" : "暂停显示"}
            </Button>
          </>
        }
      />
      <Tabs value={tab} onValueChange={(value) => filter("tab", String(value))}>
        <TabsList>
          {tabs.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      >
        {sample && (
          <>
            <div className="flex flex-wrap justify-between gap-3">
              <div className="flex items-center gap-2">
                <Status status={freshness(sample.sampledAt, now)} />
                <span className="text-xs text-muted-foreground">
                  采样于 {formatTime(sample.sampledAt, timeZone)}
                </span>
              </div>
              {(tab === "disk" || tab === "network") && (
                <Choice
                  label={tab === "disk" ? "挂载点" : "网卡"}
                  value={device}
                  onChange={(value) => filter("device", value)}
                  options={options}
                />
              )}
            </div>
            <Card>
              <CardHeader>
                <CardTitle>
                  {tabs.find((item) => item.value === tab)?.label}趋势
                  {tab === "network" ? " · 下行" : ""}
                </CardTitle>
                <CardDescription>
                  {tab === "disk"
                    ? "容量按总容量计算；保留块与用户可用空间分开展示"
                    : "采样间隔与可用历史由服务器返回"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <QueryState
                  pending={history.isPending}
                  error={history.error}
                  retry={() => void history.refetch()}
                >
                  {history.data && (
                    <Suspense fallback={<Skeleton className="h-60" />}>
                      <ResourceChart
                        history={history.data}
                        label={tab === "network" ? "下行" : "使用率"}
                        timeZone={timeZone}
                      />
                    </Suspense>
                  )}
                </QueryState>
              </CardContent>
            </Card>
            {tab === "cpu" && (
              <Card>
                <CardHeader>
                  <CardTitle>各核使用率</CardTitle>
                  <CardDescription>
                    负载 1 / 5 / 15 分钟：
                    {sample.loadAverage
                      ? `${sample.loadAverage.one.toFixed(2)} / ${sample.loadAverage.five.toFixed(2)} / ${sample.loadAverage.fifteen.toFixed(2)}`
                      : "不可用"}
                    （不是百分比）
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                  {sample.cpuPerCorePercent.map((core, i) => (
                    <div key={i} className="flex flex-col gap-2">
                      <div className="flex justify-between text-sm">
                        <span>CPU {i}</span>
                        <span className="font-mono">{formatPercent(core)}</span>
                      </div>
                      <Progress
                        value={core.value}
                        aria-label={`CPU ${i} 使用率`}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            {tab === "memory" && (
              <Card>
                <CardHeader>
                  <CardTitle>内存与 Swap</CardTitle>
                  <CardDescription>
                    已用内存 = MemTotal − MemAvailable
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="detail-grid text-sm">
                    <dt>总量</dt>
                    <dd>{formatBytes(sample.memory.totalBytes)}</dd>
                    <dt>已用</dt>
                    <dd>{formatBytes(sample.memory.usedBytes)}</dd>
                    <dt>可用</dt>
                    <dd>{formatBytes(sample.memory.availableBytes)}</dd>
                    <dt>缓存</dt>
                    <dd>{formatBytes(sample.memory.cachedBytes)}</dd>
                    <dt>Swap</dt>
                    <dd>
                      {sample.memory.swapTotalBytes === 0
                        ? "未配置"
                        : `${formatBytes(sample.memory.swapUsedBytes)} / ${formatBytes(sample.memory.swapTotalBytes)}`}
                    </dd>
                  </dl>
                </CardContent>
              </Card>
            )}
            {tab === "disk" && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>文件系统容量</CardTitle>
                    <CardDescription>
                      容量默认每 15 秒采集，按自身时间判断过期
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DataTable
                      headers={[
                        "挂载点",
                        "已用 / 总量",
                        "用户可用",
                        "采样时间",
                        "状态",
                      ]}
                      rows={sample.filesystems.map((fs) => ({
                        id: fs.id,
                        cells: [
                          <code>{fs.mountPoint}</code>,
                          `${formatBytes(fs.usedBytes)} / ${formatBytes(fs.totalBytes)}`,
                          formatBytes(fs.availableBytes),
                          formatTime(fs.sampledAt, timeZone),
                          <Status
                            status={freshness(fs.sampledAt, now, true)}
                          />,
                        ],
                      }))}
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>块设备 I/O</CardTitle>
                    <Choice
                      label="块设备"
                      value={ioDevice}
                      onChange={(value) => filter("block", value)}
                      options={sample.blockDevices.map((item) => ({
                        value: item.id,
                        label: item.name,
                      }))}
                    />
                    <CardDescription>
                      按实际采样间隔计算；不叠加分区与父设备
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DataTable
                      headers={["设备", "读取", "写入"]}
                      rows={sample.blockDevices.map((device) => ({
                        id: device.id,
                        cells: [
                          device.name,
                          formatBytes(device.readBytesPerSecond.value, true),
                          formatBytes(device.writeBytesPerSecond.value, true),
                        ],
                      }))}
                    />
                  </CardContent>
                </Card>
                {ioDevice && (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {[
                      { query: diskRead, label: "磁盘读取" },
                      { query: diskWrite, label: "磁盘写入" },
                    ].map(({ query, label }) => (
                      <Card key={label}>
                        <CardHeader>
                          <CardTitle>{label}</CardTitle>
                          <CardDescription>
                            按块设备显示字节速率
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <QueryState
                            pending={query.isPending}
                            error={query.error}
                          >
                            {query.data && (
                              <Suspense
                                fallback={<Skeleton className="h-60" />}
                              >
                                <ResourceChart
                                  history={query.data}
                                  label={label}
                                  timeZone={timeZone}
                                />
                              </Suspense>
                            )}
                          </QueryState>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            )}
            {tab === "network" && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>网络趋势 · 上行</CardTitle>
                    <CardDescription>与下行保持相同速率单位</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <QueryState pending={upload.isPending} error={upload.error}>
                      {upload.data && (
                        <Suspense fallback={<Skeleton className="h-60" />}>
                          <ResourceChart history={upload.data} label="上行" />
                        </Suspense>
                      )}
                    </QueryState>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>网卡累计字节</CardTitle>
                    <CardDescription>
                      不把虚拟接口与物理接口重复相加
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DataTable
                      headers={[
                        "网卡",
                        "下行速率",
                        "上行速率",
                        "接收字节",
                        "发送字节",
                      ]}
                      rows={sample.networks.map((network) => ({
                        id: network.id,
                        cells: [
                          network.name,
                          formatBytes(network.rxBytesPerSecond.value, true),
                          formatBytes(network.txBytesPerSecond.value, true),
                          <code>{network.rxTotalBytes ?? "不可用"}</code>,
                          <code>{network.txTotalBytes ?? "不可用"}</code>,
                        ],
                      }))}
                    />
                  </CardContent>
                </Card>
              </>
            )}
          </>
        )}
      </QueryState>
    </div>
  );
}
