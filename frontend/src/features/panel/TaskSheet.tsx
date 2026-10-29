import { actionLabels, stageLabels } from "@/features/panel/navigation";
import { useDisplayTimezone } from "@/features/panel/display";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { request } from "@/lib/api/client";
import { logPageSchema, taskSchema, pageSchema } from "@/lib/api/schemas";
import type { Task } from "@/types/panel.type";
import { formatBytes, formatTime } from "@/lib/format";
import { queryClient, taskQuery, tasksQuery } from "./queries";
import { QueryState, Status } from "./Shared";
/** taskOrder 保持活动任务在前、失败其次，实时事件不会打乱展示优先级。 */
function taskOrder(a: Task, b: Task) {
  const rank = (task: Task) =>
    ["queued", "running"].includes(task.status)
      ? 0
      : ["failed", "interrupted"].includes(task.status)
        ? 1
        : 2;
  return rank(a) - rank(b) || Date.parse(b.createdAt) - Date.parse(a.createdAt);
}
/** TaskSheet 通过 URL 恢复任务，关闭抽屉不会取消执行。 */
export function TaskSheet() {
  const timeZone = useDisplayTimezone();
  const [params, setParams] = useSearchParams();
  const selected = params.get("task") ?? "";
  const open = params.has("task");
  const cursor = params.get("taskCursor") ?? "";
  const tasks = useQuery({
    ...tasksQuery,
    queryKey: cursor ? ["tasks", "page", cursor] : tasksQuery.queryKey,
    queryFn: ({ signal }) =>
      request(
        `/tasks?limit=200&cursor=${encodeURIComponent(cursor)}`,
        pageSchema(taskSchema),
        { signal },
      ),
    enabled: open,
  });
  const detail = useQuery(taskQuery(selected === "all" ? "" : selected));
  const logs = useQuery({
    queryKey: ["task", selected, "logs"],
    queryFn: ({ signal }) =>
      request(`/tasks/${encodeURIComponent(selected)}/logs`, logPageSchema, {
        signal,
      }),
    enabled: open && selected !== "all" && !!selected,
    refetchInterval:
      open && detail.data && ["running", "queued"].includes(detail.data.status)
        ? 5000
        : false,
  });
  const cancel = useMutation({
    mutationFn: () =>
      request(`/tasks/${encodeURIComponent(selected)}/cancel`, taskSchema, {
        method: "POST",
        body: "{}",
      }),
    onSuccess: (task) => {
      queryClient.setQueryData(["task", selected], task);
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
  /** 只更新覆盖层参数，保留页面筛选与位置。 */
  function select(id: string | null) {
    setParams((previous) => {
      if (id) previous.set("task", id);
      else {
        previous.delete("task");
        previous.delete("taskCursor");
      }
      return previous;
    });
  }
  const task = detail.data;
  const percent =
    task?.progress.totalBytes && task.progress.completedBytes !== null
      ? (task.progress.completedBytes / task.progress.totalBytes) * 100
      : null;
  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        if (!value) select(null);
      }}
    >
      <SheetContent className="w-full sm:max-w-[640px]">
        <SheetHeader>
          <SheetTitle>任务记录</SheetTitle>
          <SheetDescription>
            仅展示后端实际任务。关闭面板后，已受理任务继续执行。
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 pb-4">
          {selected === "all" || !selected ? (
            <QueryState
              pending={tasks.isPending}
              error={tasks.error}
              retry={() => void tasks.refetch()}
            >
              <ItemGroup>
                {tasks.data?.items.toSorted(taskOrder).map((item) => (
                  <Item
                    key={item.id}
                    variant="outline"
                    render={
                      <button type="button" onClick={() => select(item.id)} />
                    }
                  >
                    <ItemContent>
                      <ItemTitle>
                        {actionLabels[item.action] ?? item.action}
                      </ItemTitle>
                      <ItemDescription>
                        {formatTime(item.createdAt, timeZone)} ·{" "}
                        {stageLabels[item.stage] ?? item.stage}
                      </ItemDescription>
                    </ItemContent>
                    <Status status={item.status} />
                  </Item>
                ))}
                {tasks.data?.items.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    暂时没有任务。
                  </p>
                )}
              </ItemGroup>
              {(cursor || tasks.data?.nextCursor) && (
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    disabled={!cursor}
                    onClick={() =>
                      setParams((previous) => {
                        previous.delete("taskCursor");
                        return previous;
                      })
                    }
                  >
                    最新任务
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!tasks.data?.nextCursor}
                    onClick={() =>
                      setParams((previous) => {
                        previous.set(
                          "taskCursor",
                          tasks.data?.nextCursor ?? "",
                        );
                        return previous;
                      })
                    }
                  >
                    下一页任务
                  </Button>
                </div>
              )}
            </QueryState>
          ) : (
            <>
              <Button variant="ghost" onClick={() => select("all")}>
                返回任务列表
              </Button>
              <QueryState
                pending={detail.isPending}
                error={detail.error}
                retry={() => void detail.refetch()}
              >
                {task && (
                  <>
                    <div className="flex flex-wrap justify-between gap-2">
                      <code>{actionLabels[task.action] ?? task.action}</code>
                      <Status status={task.status} />
                    </div>
                    <p className="text-sm">
                      当前阶段：{stageLabels[task.stage] ?? task.stage}
                    </p>
                    {task.progress.completedBytes !== null && (
                      <>
                        <Progress value={percent} aria-label="下载进度" />
                        <p className="text-xs text-muted-foreground">
                          {formatBytes(task.progress.completedBytes)} /{" "}
                          {formatBytes(task.progress.totalBytes)}
                        </p>
                      </>
                    )}
                    {task.error && (
                      <Alert variant="destructive">
                        <AlertTitle>{task.error.message}</AlertTitle>
                        <AlertDescription>
                          {task.error.code} ·{" "}
                          {task.error.recoverable
                            ? "请返回对应资源重新预检后重试。"
                            : "请检查日志与服务器状态。"}
                        </AlertDescription>
                      </Alert>
                    )}
                    {task.status === "succeeded" &&
                      typeof task.result?.exportId === "string" && (
                        <Button
                          nativeButton={false}
                          variant="outline"
                          render={
                            <a
                              href={`/api/v1/logs/exports/${encodeURIComponent(task.result.exportId)}/download`}
                              download
                            />
                          }
                        >
                          下载日志（10 分钟内有效）
                        </Button>
                      )}
                    {task.result && (
                      <pre className="overflow-auto rounded-lg bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
                        {JSON.stringify(task.result, null, 2)}
                      </pre>
                    )}
                    {task.canCancel && (
                      <Button
                        variant="outline"
                        disabled={cancel.isPending}
                        onClick={() => cancel.mutate()}
                      >
                        {task.cancelRequestedAt
                          ? "已请求取消，等待安全阶段"
                          : "请求取消"}
                      </Button>
                    )}
                    <QueryState error={cancel.error} />
                    <QueryState
                      pending={logs.isPending}
                      error={logs.error}
                      retry={() => void logs.refetch()}
                    >
                      <div className="rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-5">
                        {logs.data?.items.map((line) => (
                          <p key={line.id} className="break-all">
                            {formatTime(line.at, timeZone)} [{line.level}]{" "}
                            {line.message}
                          </p>
                        ))}
                        {logs.data?.items.length === 0 && "尚无阶段日志"}
                      </div>
                    </QueryState>
                  </>
                )}
              </QueryState>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
