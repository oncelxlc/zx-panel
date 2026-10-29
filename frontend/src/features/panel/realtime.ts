import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { AUTH_STATE_EVENT, clearAuthToken } from "@/auth/session";
import { getSession } from "@/auth/api";
import { request } from "@/lib/api/client";
import { snapshotSchema, taskSchema } from "@/lib/api/schemas";
import { bootstrapQuery, queryClient, tasksQuery } from "./queries";
import type {
  MetricSnapshot,
  Page,
  StreamState,
  Task,
} from "@/types/panel.type";
/** eventSchema 验证事件封装，具体 payload 继续按事件类型校验。 */
const eventSchema = z.object({ streamEpoch: z.string(), payload: z.unknown() });
/** useRealtime 只挂载于应用壳层，统一管理主 SSE、重连与后备轮询。 */
export function useRealtime() {
  const bootstrap = useQuery(bootstrapQuery);
  const [state, setState] = useState<StreamState>("connecting");
  useEffect(() => {
    const initial = queryClient.getQueryData(bootstrapQuery.queryKey);
    if (!bootstrap.isSuccess || !initial) return;
    let cursor = initial.streamCursor;
    let epoch = initial.streamEpoch;
    let last = initial.latestMetrics.sequence;
    let attempt = 0;
    let closed = false;
    let resetting = false;
    let source: EventSource | undefined;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    queryClient.setQueryData(["metrics", "latest"], initial.latestMetrics);
    /** 缺少更新不改变数值，字段 freshness 由实际 sampledAt 判断。 */
    function acceptMetric(sample: MetricSnapshot) {
      if (sample.sequence > last) {
        last = sample.sequence;
        queryClient.setQueryData(["metrics", "latest"], sample);
      }
    }
    /** 断流时仅轮询必要资源，主流恢复后立即停止。 */
    async function fallback() {
      try {
        const [sample] = await Promise.all([
          request("/metrics/latest", snapshotSchema),
          queryClient.fetchQuery(tasksQuery),
        ]);
        if (!closed) acceptMetric(sample);
      } catch {
        /* 保留最后值，查询错误由资源页显示。 */
      }
    }
    /** 流边界丢失时重新获取 bootstrap，不能沿用过期游标。 */
    async function reset() {
      if (closed || resetting) return;
      resetting = true;
      source?.close();
      clearTimeout(reconnect);
      try {
        const next = await queryClient.fetchQuery({
          ...bootstrapQuery,
          staleTime: 0,
        });
        if (closed) return;
        epoch = next.streamEpoch;
        cursor = next.streamCursor;
        last = next.latestMetrics.sequence;
        queryClient.setQueryData(["metrics", "latest"], next.latestMetrics);
        void queryClient.invalidateQueries({
          queryKey: ["metrics", "history"],
        });
        connect();
      } catch {
        schedule();
      } finally {
        resetting = false;
      }
    }
    /** 只有一个手动重连控制器，先关闭原生自动重连连接。 */
    function schedule() {
      source?.close();
      if (closed) return;
      attempt++;
      setState(attempt > 1 ? "polling" : "reconnecting");
      if (attempt > 1 && !poll) poll = setInterval(() => void fallback(), 5000);
      clearTimeout(reconnect);
      const delay = Math.min(15000, 1000 * 2 ** Math.min(attempt - 1, 4));
      reconnect = setTimeout(
        () =>
          void getSession()
            .then((session) => {
              if (closed) return;
              if (!session.authenticated) {
                clearAuthToken();
                return;
              }
              connect();
            })
            .catch(() => schedule()),
        delay + Math.floor(Math.random() * 300),
      );
    }
    /** 每次新建连接都携带最后已接受的游标。 */
    function connect() {
      if (closed) return;
      source?.close();
      clearTimeout(reconnect);
      source = new EventSource(
        `/api/v1/events?after=${encodeURIComponent(cursor)}`,
      );
      source.onopen = () => {
        attempt = 0;
        clearInterval(poll);
        poll = undefined;
        setState("live");
      };
      source.onerror = schedule;
      for (const name of [
        "metrics.sample",
        "task.updated",
        "runtime.changed",
        "app.changed",
        "capabilities.changed",
        "heartbeat",
        "reset",
        "auth.expired",
      ])
        source.addEventListener(name, (event: MessageEvent<string>) => {
          if (closed) return;
          if (name === "auth.expired") {
            clearAuthToken();
            return;
          }
          if (name === "reset") {
            void reset();
            return;
          }
          try {
            const frame = eventSchema.parse(JSON.parse(event.data));
            if (frame.streamEpoch !== epoch) {
              void reset();
              return;
            }
            if (name === "metrics.sample")
              acceptMetric(snapshotSchema.parse(frame.payload));
            if (name === "task.updated") {
              const task = taskSchema.parse(frame.payload);
              queryClient.setQueryData<Task>(["task", task.id], (old) =>
                !old || task.revision > old.revision ? task : old,
              );
              queryClient.setQueryData<Page<Task>>(["tasks"], (old) => {
                if (!old) return old;
                const found = old.items.find((item) => item.id === task.id);
                if (found && found.revision >= task.revision) return old;
                return {
                  ...old,
                  items: [
                    task,
                    ...old.items.filter((item) => item.id !== task.id),
                  ].slice(0, 200),
                };
              });
            }
            if (name === "runtime.changed")
              void queryClient.invalidateQueries({ queryKey: ["runtimes"] });
            if (name === "app.changed") {
              void queryClient.invalidateQueries({ queryKey: ["apps"] });
              void queryClient.invalidateQueries({ queryKey: ["app"] });
              void queryClient.invalidateQueries({ queryKey: ["runtimes"] });
            }
            if (name === "capabilities.changed") {
              void queryClient.invalidateQueries({
                queryKey: ["system", "capabilities"],
              });
              void reset();
            }
            if (event.lastEventId) cursor = event.lastEventId;
          } catch {
            void reset();
          }
        });
    }
    /** 退出时同步断流，防止敏感数据继续进入已经清空的缓存。 */
    function stop() {
      closed = true;
      source?.close();
      clearTimeout(reconnect);
      clearInterval(poll);
    }
    connect();
    window.addEventListener(AUTH_STATE_EVENT, stop);
    return () => {
      stop();
      window.removeEventListener(AUTH_STATE_EVENT, stop);
    };
  }, [bootstrap.isSuccess]);
  return { ...bootstrap, streamState: state };
}
/** useLatestMetrics 订阅唯一指标缓存，不复制到页面局部 state。 */
export function useLatestMetrics() {
  return useQuery({
    queryKey: ["metrics", "latest"],
    queryFn: ({ signal }) =>
      request("/metrics/latest", snapshotSchema, { signal }),
    staleTime: Infinity,
  });
}
/** useNow 定期重算过期文案；隐藏页面降低无意义刷新。 */
export function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, 2000);
    return () => clearInterval(timer);
  }, []);
  return import.meta.env.VITE_DATA_MODE === "mock"
    ? Date.parse("2026-09-28T14:24:00Z")
    : now;
}
