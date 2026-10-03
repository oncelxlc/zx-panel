import { useRef, useState } from "react";
import { z } from "zod";
import { useDisplayTimezone } from "@/features/panel/display";
import { Link, useParams, useSearchParams } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ToastNotice } from "@/features/panel/ToastNotice";
import {
  CopyText,
  DataTable,
  PageHeading,
  QueryState,
  Status,
} from "@/features/panel/Shared";
import { OperationSheet } from "@/features/panel/OperationSheet";
import {
  bootstrapQuery,
  installationsQuery,
  queryClient,
  releasesQuery,
  runtimesQuery,
} from "@/features/panel/queries";
import { request } from "@/lib/api/client";
import {
  appSchema,
  processSchema,
  runtimeKindSchema,
  taskSchema,
} from "@/lib/api/schemas";
import { formatBytes, formatTime } from "@/lib/format";
import type { OperationSpec } from "@/types/panel.type";
/** referencesSchema 区分引用事实与扫描完整性，空数组不能自动视为可卸载。 */
const referencesSchema = z.object({
  apps: z.array(appSchema),
  processes: z.array(processSchema),
  complete: z.boolean(),
  reason: z.string().nullable(),
});
/** runtimeDescriptions 为已探测的语言环境提供名称与用途，安装能力仍按类别判断。 */
const runtimeDescriptions = {
  node: { name: "Node.js", description: "JavaScript 执行环境" },
  go: { name: "Go", description: "Go 编译工具链 · 安装不产生后台服务" },
  rust: { name: "Rust", description: "Rust 编译工具链" },
  python: { name: "Python", description: "Python 解释器" },
  java: { name: "Java", description: "Java 虚拟机与执行环境" },
  php: { name: "PHP", description: "PHP 命令行执行环境" },
  ruby: { name: "Ruby", description: "Ruby 解释器" },
  dotnet: { name: ".NET", description: ".NET 执行环境" },
  bun: { name: "Bun", description: "JavaScript / TypeScript 执行环境" },
  deno: { name: "Deno", description: "JavaScript / TypeScript 执行环境" },
};
/** RuntimesPage 区分可安装目录、面板管理和外部发现。 */
export function RuntimesPage() {
  const timeZone = useDisplayTimezone();
  const runtimes = useQuery(runtimesQuery);
  const [, setParams] = useSearchParams();
  const refreshKey = useRef("");
  const refresh = useMutation({
    mutationFn: () => {
      if (!refreshKey.current) refreshKey.current = crypto.randomUUID();
      return request("/runtimes/catalog/refresh", taskSchema, {
        method: "POST",
        headers: { "Idempotency-Key": refreshKey.current },
        body: JSON.stringify({ kinds: ["node", "go"] }),
      });
    },
    onSuccess: (task) => {
      refreshKey.current = "";
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setParams({ task: task.id });
    },
  });
  return (
    <div className="page-stack">
      <PageHeading
        title="运行时"
        description="自动识别当前服务器的执行环境与工具链，系统安装每分钟刷新"
        action={
          <Button
            variant="outline"
            disabled={refresh.isPending}
            onClick={() => refresh.mutate()}
          >
            <RefreshCw data-icon="inline-start" />
            检查更新
          </Button>
        }
      />
      <QueryState error={refresh.error} />
      <QueryState
        pending={runtimes.isPending}
        error={runtimes.error}
        retry={() => void runtimes.refetch()}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {runtimes.data?.map((runtime) => (
            <Card key={runtime.kind}>
              <CardHeader>
                <CardTitle role="heading" aria-level={2}>
                  {runtimeDescriptions[runtime.kind].name}
                </CardTitle>
                <CardDescription>
                  {runtimeDescriptions[runtime.kind].description}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <p className="break-words font-mono text-2xl font-semibold">
                  {runtime.defaultVersion ??
                    (runtime.externalVersions.join(" · ") ||
                      (runtime.kind === "node" || runtime.kind === "go"
                        ? "未设置默认版本"
                        : "版本待核实"))}
                </p>
                {runtime.defaultVersion && runtime.externalVersions.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    系统已安装：{runtime.externalVersions.join(" · ")}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {(runtime.kind === "node" || runtime.kind === "go") && (
                    <Badge variant="secondary">
                      面板管理 {runtime.panelCount}
                    </Badge>
                  )}
                  <Badge variant="outline">
                    外部发现 {runtime.externalCount}
                  </Badge>
                  {runtime.updateAvailable && (
                    <Badge variant="success">可更新</Badge>
                  )}
                </div>
                {runtime.kind === "node" || runtime.kind === "go" ? (
                  <p className="text-xs text-muted-foreground">
                    目录：{formatTime(runtime.checkedAt, timeZone)} ·{" "}
                    {runtime.cacheState === "unavailable"
                      ? "尚无可用目录"
                      : runtime.cacheState === "stale"
                        ? "缓存数据"
                        : "已检查"}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    系统安装只读 · 查看版本与安装路径
                  </p>
                )}
              </CardContent>
              <CardFooter>
                <Button
                  nativeButton={false}
                  render={
                    <Link
                      to={`/runtimes/${runtime.kind}${(runtime.kind === "node" || runtime.kind === "go") && runtime.panelCount + runtime.externalCount === 0 ? "?action=install" : ""}`}
                    />
                  }
                >
                  {runtime.kind !== "node" && runtime.kind !== "go"
                    ? "查看安装"
                    : runtime.panelCount + runtime.externalCount === 0
                      ? "安装版本"
                      : "管理版本"}
                  <ArrowRight data-icon="inline-end" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </QueryState>
    </div>
  );
}
/** RuntimeDetailPage 所有有副作用动作都交给统一预检流程。 */
export function RuntimeDetailPage() {
  const timeZone = useDisplayTimezone();
  const { kind = "node" } = useParams();
  const parsedKind = runtimeKindSchema.safeParse(kind);
  const description = parsedKind.success
    ? runtimeDescriptions[parsedKind.data]
    : null;
  const managed = kind === "node" || kind === "go";
  const [params, setParams] = useSearchParams();
  const installs = useQuery({
    ...installationsQuery(kind, params.get("installedCursor") ?? ""),
    enabled: parsedKind.success,
  });
  const releases = useQuery({
    ...releasesQuery(kind, params.get("catalogCursor") ?? ""),
    enabled: managed,
  });
  const referenceID = params.get("references") ?? "";
  const references = useQuery({
    queryKey: ["runtime-references", referenceID],
    enabled: !!referenceID,
    queryFn: ({ signal }) =>
      request(
        `/runtime-installations/${encodeURIComponent(referenceID)}/references`,
        referencesSchema,
        { signal },
      ),
  });
  const bootstrap = useQuery(bootstrapQuery);
  const [operation, setOperation] = useState<OperationSpec | null>(null);
  const [defaultChoice, setMakeDefault] = useState<boolean | null>(null);
  const makeDefault = defaultChoice ?? installs.data?.items.length === 0;
  const tab =
    !managed
      ? "installed"
      : params.get("action") === "install"
        ? "available"
        : (params.get("tab") ?? "installed");
  /** 筛选留在 URL，不把安装路径或秘密配置写入 URL。 */
  function changeTab(value: string) {
    setParams((previous) => {
      previous.delete("action");
      previous.set("tab", value);
      return previous;
    });
  }
  /** 游标和引用详情可分享，关闭详情不会改变安装资源。 */
  function changeParam(key: string, value: string) {
    setParams((previous) => {
      if (value) previous.set(key, value);
      else previous.delete(key);
      return previous;
    });
  }
  if (!description)
    return (
      <>
        <ToastNotice
          title="不支持的运行时"
          description="该类别尚不支持自动识别。"
          type="error"
        />
        <Button nativeButton={false} render={<Link to="/runtimes" />}>
          返回运行时列表
        </Button>
      </>
    );
  const capabilities = bootstrap.data?.capabilities;
  const items = installs.data?.items ?? [];
  return (
    <div className="page-stack">
      <PageHeading
        title={kind === "go" ? "Go 工具链" : description.name}
        description={
          !managed
            ? "自动展示系统已安装版本与路径；外部安装只读"
            : kind === "node"
              ? "多版本隔离安装，应用绑定具体安装实例"
              : "工具链升级不会重编译或更新已有 Go 应用"
        }
        action={
          managed ? (
            <Button onClick={() => changeTab("available")}>
              <Download data-icon="inline-start" />
              安装版本
            </Button>
          ) : undefined
        }
      />
      {managed && (
        <Tabs value={tab} onValueChange={(value) => changeTab(String(value))}>
          <TabsList variant="line">
            <TabsTrigger value="installed">已安装</TabsTrigger>
            <TabsTrigger value="available">可安装</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      {tab === "available" ? (
        <Card>
          <CardHeader>
            <CardTitle>官方版本目录</CardTitle>
            <CardDescription>
              {formatTime(releases.data?.checkedAt, timeZone)} ·{" "}
              {releases.data?.cacheState === "stale"
                ? "检查失败或已过期，保留上次结果"
                : "版本与兼容性由本机后端核对"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field orientation="horizontal">
              <Checkbox
                id="make-default"
                checked={makeDefault}
                onCheckedChange={(checked) => setMakeDefault(checked)}
              />
              <FieldLabel htmlFor="make-default">
                安装后设为面板默认（不改变现有应用绑定或系统 PATH）
              </FieldLabel>
            </Field>
            <QueryState
              pending={releases.isPending}
              error={releases.error}
              retry={() => void releases.refetch()}
            >
              <DataTable
                headers={["版本", "通道", "平台", "归档体积", "兼容性", "操作"]}
                rows={(releases.data?.items ?? []).map((release) => ({
                  id: release.id,
                  cells: [
                    <code>{release.version}</code>,
                    release.channel === "lts"
                      ? "LTS"
                      : release.channel === "current"
                        ? "Current"
                        : release.channel === "stable"
                          ? "稳定"
                          : release.channel,
                    release.platform,
                    <div className="flex flex-col gap-1">
                      {formatBytes(release.downloadBytes)}
                      {release.verifiedArtifactCached && (
                        <Badge variant="outline">已验证缓存</Badge>
                      )}
                    </div>,
                    release.compatible
                      ? "兼容"
                      : (release.incompatibilityReason ?? "不兼容"),
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        !release.compatible ||
                        !capabilities?.installRuntime.enabled
                      }
                      title={capabilities?.installRuntime.message ?? undefined}
                      onClick={() =>
                        setOperation({
                          action: "runtime.install",
                          releaseId: release.id,
                          makeDefault,
                        })
                      }
                    >
                      安装
                    </Button>,
                  ],
                }))}
                empty="没有可用版本目录，请在运行时首页检查更新"
              />
              {(params.has("catalogCursor") || releases.data?.nextCursor) && (
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    disabled={!params.has("catalogCursor")}
                    onClick={() => changeParam("catalogCursor", "")}
                  >
                    首页
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!releases.data?.nextCursor}
                    onClick={() =>
                      changeParam(
                        "catalogCursor",
                        releases.data?.nextCursor ?? "",
                      )
                    }
                  >
                    下一页版本
                  </Button>
                </div>
              )}
            </QueryState>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>安装实例</CardTitle>
            <CardDescription>
              外部发现的版本只读；默认版本与引用中的版本不可卸载。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <QueryState
              pending={installs.isPending}
              error={installs.error}
              retry={() => void installs.refetch()}
            >
              <DataTable
                headers={["版本", "来源", "安装路径", "引用", "状态", "操作"]}
                rows={items.map((item) => ({
                  id: item.id,
                  cells: [
                    <div className="flex items-center gap-2">
                      <code>{item.version}</code>
                      {item.isPanelDefault && (
                        <Badge variant="outline">默认</Badge>
                      )}
                    </div>,
                    item.ownership === "external" ? "外部发现" : "面板管理",
                    <CopyText value={item.path} />,
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => changeParam("references", item.id)}
                    >
                      {item.configuredAppRefs} 个应用 · 查看引用
                    </Button>,
                    <Status status={item.state} />,
                    item.ownership === "external" ? (
                      <Badge variant="outline">只读</Badge>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={
                            item.isPanelDefault ||
                            item.state !== "ready" ||
                            !capabilities?.changeRuntimeDefault.enabled
                          }
                          onClick={() =>
                            setOperation({
                              action: "runtime.set-default",
                              installationId: item.id,
                              expectedRevision: item.revision,
                            })
                          }
                        >
                          设为默认
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!capabilities?.uninstallRuntime.enabled}
                          onClick={() =>
                            setOperation({
                              action: "runtime.uninstall",
                              installationId: item.id,
                              expectedRevision: item.revision,
                            })
                          }
                        >
                          卸载预检
                        </Button>
                      </div>
                    ),
                  ],
                }))}
                empty="尚未发现已安装版本"
              />
              {(params.has("installedCursor") || installs.data?.nextCursor) && (
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => changeParam("installedCursor", "")}
                  >
                    首页
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!installs.data?.nextCursor}
                    onClick={() =>
                      changeParam(
                        "installedCursor",
                        installs.data?.nextCursor ?? "",
                      )
                    }
                  >
                    下一页安装
                  </Button>
                </div>
              )}
            </QueryState>
          </CardContent>
        </Card>
      )}
      {managed && capabilities && !capabilities.installRuntime.enabled && (
        <Alert>
          <AlertTitle>当前环境仅支持可用的只读能力</AlertTitle>
          <AlertDescription>
            {capabilities.installRuntime.message}
          </AlertDescription>
        </Alert>
      )}
      <OperationSheet
        operation={operation}
        onClose={() => setOperation(null)}
      />
      <Sheet
        open={!!referenceID}
        onOpenChange={(open) => {
          if (!open) changeParam("references", "");
        }}
      >
        <SheetContent className="overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>安装引用</SheetTitle>
            <SheetDescription>
              配置绑定与当前进程分别核对；卸载时后端会重新扫描。
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4 pb-4">
            <QueryState
              pending={references.isPending}
              error={references.error}
              retry={() => void references.refetch()}
            >
              {references.data && (
                <>
                  <Status
                    status={references.data.complete ? "ready" : "unknown"}
                  >
                    {references.data.complete ? "扫描已完成" : "扫描不完整"}
                  </Status>
                  {references.data.reason && (
                    <Alert>
                      <AlertDescription>
                        {references.data.reason}
                      </AlertDescription>
                    </Alert>
                  )}
                  <DataTable
                    headers={["绑定应用", "状态"]}
                    rows={references.data.apps.map((app) => ({
                      id: app.id,
                      cells: [
                        <Button
                          nativeButton={false}
                          variant="link"
                          render={<Link to={`/apps/${app.id}`} />}
                          onClick={() => changeParam("references", "")}
                        >
                          {app.name}
                        </Button>,
                        <Status status={app.status} />,
                      ],
                    }))}
                    empty="没有配置绑定"
                  />
                  <DataTable
                    headers={["PID", "进程", "用户"]}
                    rows={references.data.processes.map((process) => ({
                      id: process.processKey,
                      cells: [
                        process.pid,
                        process.name,
                        process.user ?? "不可用",
                      ],
                    }))}
                    empty="没有观测到进程引用"
                  />
                </>
              )}
            </QueryState>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
