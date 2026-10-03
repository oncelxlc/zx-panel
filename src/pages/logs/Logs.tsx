import type { ApplicationLogsProps } from "@/types/panel-ui.type";
import { useDisplayTimezone } from "@/features/panel/display";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useSearchParams } from "react-router";
import { z } from "zod";
import { ArrowDown, Download, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Choice, PageHeading, QueryState } from "@/features/panel/Shared";
import { ToastNotice } from "@/features/panel/ToastNotice";
import { logsQuery, queryClient, sourcesQuery } from "@/features/panel/queries";
import { logSchema, taskSchema } from "@/lib/api/schemas";
import { request } from "@/lib/api/client";
import { formatTime } from "@/lib/format";
import { mergeLogs } from "@/features/panel/logBuffer";
import { AUTH_STATE_EVENT, clearAuthToken } from "@/auth/session";
import type { LogPage, LogRecord } from "@/types/panel.type";
/** batchSchema 明确批次来源、丢弃计数与实时续接游标。 */
const batchSchema = z.object({
  sourceId: z.string(),
  records: z.array(logSchema),
  cursor: z.string(),
  droppedCount: z.number().int().nonnegative(),
});
/** logRowHeight 为虚拟测量与缓冲裁剪后的滚动补偿提供相同行高。 */
const logRowHeight = 28;
/** emptyRecords 为尚未返回的查询复用只读空数组，避免重复触发滚动补偿。 */
const emptyRecords: readonly LogRecord[] = [];
/** LogsPage 使用受控来源、虚拟列表和有界缓冲，日志始终按纯文本呈现。 */
export function LogsPage({
  sourceId: fixedSource,
  embedded = false,
}: ApplicationLogsProps = {}) {
  const timeZone = useDisplayTimezone();
  const [params, setParams] = useSearchParams();
  const sources = useQuery(sourcesQuery);
  const sourceId =
    fixedSource ?? params.get("source") ?? sources.data?.[0]?.id ?? "panel";
  const level = params.get("level") ?? "all";
  const search = params.get("search") ?? "";
  const [anchor] = useState(() =>
    import.meta.env.VITE_DATA_MODE === "mock"
      ? "2026-09-28T14:24:00Z"
      : new Date().toISOString(),
  );
  const [historyCursor, setHistoryCursor] = useState("");
  const filters = new URLSearchParams({
    sourceId,
    level,
    search,
    from:
      params.get("from") ??
      new Date(Date.parse(anchor) - 3600000).toISOString(),
    to: params.get("to") ?? "",
    limit: "500",
    cursor: historyCursor,
  }).toString();
  const query = useQuery({
    ...logsQuery(new URLSearchParams(filters)),
    enabled: !!sources.data,
  });
  const [pausedAt, setPausedAt] = useState<string | null>(null);
  const [following, setFollowing] = useState(true);
  const [dropped, setDropped] = useState(0);
  const [streamError, setStreamError] = useState("");
  const [gapDetected, setGapDetected] = useState(false);
  const element = useRef<HTMLDivElement>(null);
  const exportKey = useRef("");
  const previousLast = useRef("");
  const previousLength = useRef(0);
  const previousFilter = useRef(filters);
  const scrollOffset = useRef(0);
  const records = query.data?.items ?? emptyRecords;
  const boundary =
    pausedAt === null
      ? records.length - 1
      : records.findIndex((line) => line.id === pausedAt);
  const visible = pausedAt === null ? records : records.slice(0, boundary + 1);
  const added = pausedAt === null ? 0 : records.length - boundary - 1;
  const virtual = useVirtualizer({
    count: visible.length,
    getScrollElement: () => element.current,
    estimateSize: () => logRowHeight,
    getItemKey: (index) => visible[index]?.id ?? index,
    overscan: 12,
  });
  useLayoutEffect(() => {
    const lastIndex = records.findIndex((line) => line.id === previousLast.current);
    const removed = lastIndex < 0 ? 0 : previousLength.current - lastIndex - 1;
    if (following && pausedAt === null && visible.length) {
      virtual.scrollToIndex(visible.length - 1, { align: "end" });
    } else if (previousFilter.current === filters && removed > 0) {
      // 使用上次实际位置补偿前缀裁剪，避免浏览器收缩滚动区后再次跳动。
      virtual.scrollToOffset(Math.max(0, scrollOffset.current - removed * logRowHeight));
    } else if (previousFilter.current !== filters) {
      virtual.scrollToOffset(0);
    }
    previousLast.current = records.at(-1)?.id ?? "";
    previousLength.current = records.length;
    previousFilter.current = filters;
    scrollOffset.current = element.current?.scrollTop ?? 0;
  }, [records, filters, following, pausedAt, virtual, visible.length]);
  const ready = query.isSuccess;
  useEffect(() => {
    if (!ready || historyCursor) return;
    const options = logsQuery(new URLSearchParams(filters));
    let cursor = queryClient.getQueryData(options.queryKey)?.tailCursor ?? "";
    let connection: EventSource | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let resetting = false;
    /** 轮转或过期重新取历史，界面保留明确的缺口提示。 */
    async function reset() {
      if (stopped || resetting) return;
      resetting = true;
      connection?.close();
      clearTimeout(retry);
      setGapDetected(true);
      setStreamError("日志轮转或游标过期，已标记缺口并重新同步。");
      try {
        const page = await queryClient.fetchQuery({ ...options, staleTime: 0 });
        cursor = page.tailCursor ?? "";
        if (!stopped) connect();
      } catch {
        schedule();
      } finally {
        resetting = false;
      }
    }
    /** 显式关闭原连接，防止原生与手动重连叠加。 */
    function schedule() {
      connection?.close();
      clearTimeout(retry);
      if (!stopped) {
        setStreamError("日志连接中断，正在重连；保留最后记录。");
        retry = setTimeout(connect, 5000);
      }
    }
    /** 每次连接带当前来源和筛选，不把历史翻页游标传给 after。 */
    function connect() {
      if (stopped || document.hidden) return;
      const streamParams = new URLSearchParams(filters);
      streamParams.delete("cursor");
      streamParams.set("after", cursor);
      connection?.close();
      clearTimeout(retry);
      connection = new EventSource(`/api/v1/logs/stream?${streamParams}`);
      connection.onopen = () => setStreamError("");
      connection.onerror = schedule;
      connection.addEventListener("logs.reset", () => void reset());
      connection.addEventListener("auth.expired", clearAuthToken);
      connection.addEventListener(
        "logs.batch",
        (event: MessageEvent<string>) => {
          if (stopped) return;
          try {
            const batch = batchSchema.parse(JSON.parse(event.data));
            if (batch.sourceId !== sourceId) return;
            cursor = batch.cursor;
            const old = queryClient.getQueryData<LogPage>(options.queryKey);
            if (old) {
              const next = mergeLogs(old.items, batch.records);
              if (next.droppedCount || batch.droppedCount)
                setDropped(
                  (count) => count + next.droppedCount + batch.droppedCount,
                );
              queryClient.setQueryData(options.queryKey, {
                ...old,
                items: next.records,
                tailCursor: batch.cursor,
              });
            }
          } catch {
            void reset();
          }
        },
      );
    }
    /** 离开来源、隐藏标签或退出登录都关闭当前日志流。 */
    function stop() {
      stopped = true;
      connection?.close();
      clearTimeout(retry);
    }
    /** 隐藏页暂停日志网络工作，回到前台用游标续接。 */
    function visibility() {
      if (document.hidden) {
        connection?.close();
        clearTimeout(retry);
      } else connect();
    }
    connect();
    window.addEventListener(AUTH_STATE_EVENT, stop);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      stop();
      window.removeEventListener(AUTH_STATE_EVENT, stop);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [filters, ready, historyCursor, sourceId]);
  const exportLogs = useMutation({
    mutationFn: () => {
      if (!exportKey.current) exportKey.current = crypto.randomUUID();
      const values = Object.fromEntries(new URLSearchParams(filters));
      delete values.cursor;
      delete values.limit;
      return request("/logs/exports", taskSchema, {
        method: "POST",
        headers: { "Idempotency-Key": exportKey.current },
        body: JSON.stringify(values),
      });
    },
    onSuccess: (task) => {
      exportKey.current = "";
      setParams((previous) => {
        previous.set("task", task.id);
        return previous;
      });
    },
  });
  /** 切换筛选时恢复实时范围，已有流由 effect 释放。 */
  function filter(key: string, value: string) {
    setHistoryCursor("");
    setPausedAt(null);
    setDropped(0);
    setGapDetected(false);
    exportKey.current = "";
    setParams(
      (previous) => {
        previous.set(key, value);
        return previous;
      },
      { replace: key === "search" },
    );
  }
  return (
    <div className="page-stack">
      {gapDetected && (
        <Alert>
          <AlertTitle>日志存在同步缺口</AlertTitle>
          <AlertDescription>
            游标已过期或日志已轮转。当前显示重新同步后的记录，缺失内容不会被补造。
          </AlertDescription>
        </Alert>
      )}
      <PageHeading
        title={embedded ? "应用日志" : "日志"}
        description="面板服务、托管应用与操作审计 · 只读取已授权来源"
        action={
          <>
            <Button
              variant="outline"
              onClick={() =>
                setPausedAt(
                  pausedAt === null ? (records.at(-1)?.id ?? "") : null,
                )
              }
            >
              {pausedAt === null ? (
                <Pause data-icon="inline-start" />
              ) : (
                <Play data-icon="inline-start" />
              )}
              {pausedAt === null ? "暂停显示" : "恢复显示"}
            </Button>
            <Button
              variant="outline"
              disabled={
                exportLogs.isPending ||
                !sources.data?.find((item) => item.id === sourceId)
                  ?.capabilities.export
              }
              onClick={() => exportLogs.mutate()}
            >
              <Download data-icon="inline-start" />
              导出
            </Button>
          </>
        }
      />
      <QueryState error={sources.error} retry={() => void sources.refetch()} />
      <QueryState error={exportLogs.error} />
      {streamError && (
        <ToastNotice
          id={`log-stream:${sourceId}`}
          title="实时状态"
          description={streamError}
          type="warning"
        />
      )}
      {dropped > 0 && (
        <Alert>
          <AlertTitle>缓冲已裁剪 {dropped} 条记录</AlertTitle>
          <AlertDescription>
            显示限制为 5000 行 / 5 MiB，可缩小时间范围重新读取或受控导出。
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>日志记录</CardTitle>
          <CardDescription>
            最大单行 16 KiB，截断会标记；复制时仅选择需要的文本
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Choice
              disabled={!!fixedSource}
              label="来源"
              value={sourceId}
              onChange={(value) => filter("source", value)}
              options={(sources.data ?? []).map((item) => ({
                value: item.id,
                label: item.label,
              }))}
            />
            <Choice
              label="级别"
              value={level}
              onChange={(value) => filter("level", value)}
              options={[
                { value: "all", label: "全部" },
                { value: "debug", label: "Debug" },
                { value: "info", label: "Info" },
                { value: "warn", label: "Warn" },
                { value: "error", label: "Error" },
              ]}
            />
            <Input
              className="max-w-xs"
              value={search}
              onChange={(event) => filter("search", event.target.value)}
              placeholder="纯文本搜索…"
              aria-label="搜索日志"
            />
            <Choice
              label="时间"
              value={params.get("range") ?? "1h"}
              onChange={(value) => {
                const hours = value === "24h" ? 24 : 1;
                filter(
                  "from",
                  new Date(Date.parse(anchor) - hours * 3600000).toISOString(),
                );
                filter("range", value);
              }}
              options={[
                { value: "1h", label: "近 1 小时" },
                { value: "24h", label: "近 24 小时" },
              ]}
            />
          </div>
          <QueryState
            pending={query.isPending}
            error={query.error}
            retry={() => void query.refetch()}
          >
            <div
              className="log-lines rounded-lg border bg-muted/20"
              ref={element}
              tabIndex={0}
              role="region"
              aria-label="日志纯文本，可选择复制"
              onScroll={() => {
                scrollOffset.current = element.current?.scrollTop ?? 0;
              }}
              onWheel={(event) => { if (event.deltaY < 0) setFollowing(false); }}
              onPointerDown={() => setFollowing(false)}
              onKeyDown={(event) => {
                if (["ArrowUp", "PageUp", "Home"].includes(event.key)) setFollowing(false);
              }}
            >
              <div
                style={{
                  height: virtual.getTotalSize(),
                  width: "100%",
                  position: "relative",
                }}
              >
                {virtual.getVirtualItems().map((row) => {
                  const line = visible[row.index];
                  return (
                    <div
                      key={line.id}
                      className="absolute top-0 left-0 flex w-max min-w-full gap-3 px-3 font-mono text-xs leading-7"
                      style={{
                        transform: `translateY(${row.start}px)`,
                        height: row.size,
                      }}
                    >
                      <span className="text-muted-foreground">
                        {formatTime(line.at, timeZone)}
                      </span>
                      <span
                        className={
                          line.level === "error"
                            ? "text-danger"
                            : line.level === "warn"
                              ? "text-warning"
                              : "text-muted-foreground"
                        }
                      >
                        [{line.level.toUpperCase()}]
                      </span>
                      <span className="whitespace-pre">
                        {line.message}
                        {line.truncated ? " …[已截断]" : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
              {visible.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">
                  {pausedAt !== null && records.length
                    ? "暂停位置已超出保留窗口，请恢复显示。"
                    : "当前范围没有日志记录。"}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {visible.length} 条显示
                {pausedAt !== null && (
                  <Badge variant="secondary">新增 {added} 条</Badge>
                )}
              </span>
              <div className="flex gap-2">
                {query.data?.nextCursor && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setFollowing(false);
                      setHistoryCursor(query.data?.nextCursor ?? "");
                    }}
                  >
                    读取更早记录
                  </Button>
                )}
                {(!following || historyCursor) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setHistoryCursor("");
                      setPausedAt(null);
                      setFollowing(true);
                      void query.refetch();
                    }}
                  >
                    <ArrowDown data-icon="inline-start" />
                    回到最新
                  </Button>
                )}
              </div>
            </div>
          </QueryState>
        </CardContent>
      </Card>
    </div>
  );
}
