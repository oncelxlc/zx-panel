import { UnsavedChanges } from "@/features/panel/UnsavedChanges";
import { LogsPage } from "@/pages/logs/Logs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDisplayTimezone } from "@/features/panel/display";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  appQuery,
  appsQuery,
  bootstrapQuery,
  installationsQuery,
  processesQuery,
} from "@/features/panel/queries";
import {
  Choice,
  CopyText,
  DataTable,
  PageHeading,
  QueryState,
  Status,
} from "@/features/panel/Shared";
import { OperationSheet } from "@/features/panel/OperationSheet";
import { formatBytes, formatTime } from "@/lib/format";
import type { AppFormProps, AppFormValues } from "@/types/app-form.type";
import type {
  EnvironmentChange,
  ManagedApp,
  OperationSpec,
} from "@/types/panel.type";
/** appFormSchema 在客户端限制表单结构；后端仍验证真实路径和权限。 */
const appFormSchema = z
  .object({
    name: z
      .string()
      .regex(
        /^[a-z][a-z0-9-]{1,63}$/,
        "使用 2–64 个小写字母、数字或短横线，以字母开头",
      ),
    kind: z.enum(["node", "binary"]),
    workingDirectory: z.string().min(1, "请输入应用目录"),
    executable: z.string().min(1, "请输入入口或可执行文件"),
    runtimeInstallationId: z.string(),
    runAsUser: z.string().min(1, "请选择服务账号"),
    restartPolicy: z.enum(["no", "on-failure"]),
    args: z.string().refine((value) => {
      try {
        const parsed: unknown = JSON.parse(value);
        return (
          Array.isArray(parsed) &&
          parsed.length <= 128 &&
          parsed.every((item) => typeof item === "string")
        );
      } catch {
        return false;
      }
    }, "参数必须是字符串 JSON 数组"),
    environment: z.string().refine(
      (value) =>
        value === "" ||
        value
          .split(/\r?\n/)
          .filter(Boolean)
          .every((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line)),
      "环境变量每行使用 NAME=value",
    ),
    removeKeys: z.array(z.string()),
  })
  .refine(
    (value) => value.kind !== "node" || value.runtimeInstallationId !== "",
    { message: "请选择具体 Node.js 安装实例", path: ["runtimeInstallationId"] },
  );
/** AppForm 使用真实允许目录和账号，秘密值只提交变更且不会回显。 */
function AppForm({ app, onReview, onDirtyChange }: AppFormProps) {
  const bootstrap = useQuery(bootstrapQuery);
  const installs = useQuery(installationsQuery("node"));
  const form = useForm<AppFormValues>({
    resolver: zodResolver(appFormSchema),
    defaultValues: {
      name: app?.name ?? "",
      kind: app?.execution.kind ?? "node",
      workingDirectory: app?.workingDirectory ?? "",
      executable:
        app?.execution.kind === "node"
          ? app.execution.entryFile
          : (app?.execution.executablePath ?? ""),
      runtimeInstallationId:
        app?.execution.kind === "node"
          ? app.execution.runtimeInstallationId
          : "",
      runAsUser: app?.runAsUser ?? "",
      restartPolicy: app?.restartPolicy ?? "on-failure",
      args: JSON.stringify(app?.execution.args ?? []),
      environment: "",
      removeKeys: [],
    },
  });
  const dirty = form.formState.isDirty;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  const kind = useWatch({ control: form.control, name: "kind" });
  /** 表单通过后只打开预检，不自动保存或启动应用。 */
  function submit(values: AppFormValues) {
    const args = z.array(z.string()).parse(JSON.parse(values.args));
    const environmentChanges: EnvironmentChange[] = values.removeKeys.map(
      (key) => ({ action: "remove", key }),
    );
    for (const line of values.environment.split(/\r?\n/).filter(Boolean)) {
      const index = line.indexOf("=");
      environmentChanges.push({
        action: "set",
        key: line.slice(0, index),
        value: line.slice(index + 1),
        secret: true,
      });
    }
    const draft = {
      name: values.name,
      workingDirectory: values.workingDirectory,
      runAsUser: values.runAsUser,
      restartPolicy: values.restartPolicy,
      execution:
        values.kind === "node"
          ? {
              kind: "node" as const,
              runtimeInstallationId: values.runtimeInstallationId,
              entryFile: values.executable,
              args,
            }
          : {
              kind: "binary" as const,
              executablePath: values.executable,
              args,
              buildToolchainLabel:
                app?.execution.kind === "binary"
                  ? app.execution.buildToolchainLabel
                  : null,
            },
    };
    form.reset(values);
    onDirtyChange?.(false);
    onReview(
      app
        ? {
            action: "app.update",
            appId: app.id,
            expectedRevision: app.revision,
            app: draft,
            environmentChanges,
          }
        : { action: "app.create", app: draft, environmentChanges },
    );
  }
  return (
    <form onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-5">
      <UnsavedChanges dirty={dirty} />
      <Alert>
        <AlertTitle>使用已经部署到服务器的文件</AlertTitle>
        <AlertDescription>
          允许目录：{bootstrap.data?.system.appRoots.join("、") || "读取中"}
          。创建配置不会启动应用；修改配置在下次启动生效。
        </AlertDescription>
      </Alert>
      <FieldGroup>
        <Field data-invalid={!!form.formState.errors.name}>
          <FieldLabel htmlFor="app-name">应用名称</FieldLabel>
          <Input
            id="app-name"
            {...form.register("name")}
            aria-invalid={!!form.formState.errors.name}
          />
          <FieldError>{form.formState.errors.name?.message}</FieldError>
        </Field>
        <Controller
          control={form.control}
          name="kind"
          render={({ field }) => (
            <Choice
              label="类型"
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: "node", label: "Node.js 应用" },
                { value: "binary", label: "本机二进制" },
              ]}
            />
          )}
        />
        <Field data-invalid={!!form.formState.errors.workingDirectory}>
          <FieldLabel htmlFor="app-dir">应用目录</FieldLabel>
          <Input
            id="app-dir"
            {...form.register("workingDirectory")}
            aria-invalid={!!form.formState.errors.workingDirectory}
          />
          <FieldError>
            {form.formState.errors.workingDirectory?.message}
          </FieldError>
        </Field>
        <Field data-invalid={!!form.formState.errors.executable}>
          <FieldLabel htmlFor="app-executable">
            {kind === "node"
              ? "入口 JS 文件（相对应用目录）"
              : "可执行文件路径"}
          </FieldLabel>
          <Input
            id="app-executable"
            {...form.register("executable")}
            aria-invalid={!!form.formState.errors.executable}
          />
          <FieldError>{form.formState.errors.executable?.message}</FieldError>
        </Field>
        {kind === "node" && (
          <Field data-invalid={!!form.formState.errors.runtimeInstallationId}>
            <Controller
              name="runtimeInstallationId"
              control={form.control}
              render={({ field }) => (
                <Choice
                  label="运行时实例"
                  value={field.value}
                  onChange={field.onChange}
                  options={(installs.data?.items ?? [])
                    .filter(
                      (item) =>
                        item.state === "ready" && item.ownership === "panel",
                    )
                    .map((item) => ({
                      value: item.id,
                      label: item.version + " · " + item.path,
                    }))}
                />
              )}
            />
            <FieldError>
              {form.formState.errors.runtimeInstallationId?.message}
            </FieldError>
          </Field>
        )}
        <Field data-invalid={!!form.formState.errors.runAsUser}>
          <Controller
            control={form.control}
            name="runAsUser"
            render={({ field }) => (
              <Choice
                label="服务账号"
                value={field.value}
                onChange={field.onChange}
                options={(bootstrap.data?.system.serviceAccounts ?? []).map(
                  (value) => ({ value, label: value }),
                )}
              />
            )}
          />
          <FieldError>{form.formState.errors.runAsUser?.message}</FieldError>
        </Field>
        <Controller
          control={form.control}
          name="restartPolicy"
          render={({ field }) => (
            <Choice
              label="重启策略"
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: "no", label: "不自动重启" },
                { value: "on-failure", label: "失败时重启" },
              ]}
            />
          )}
        />
        <Field data-invalid={!!form.formState.errors.args}>
          <FieldLabel htmlFor="app-args">参数（JSON 字符串数组）</FieldLabel>
          <Textarea
            id="app-args"
            {...form.register("args")}
            aria-invalid={!!form.formState.errors.args}
            placeholder={'["--port", "3000"]'}
          />
          <FieldError>{form.formState.errors.args?.message}</FieldError>
        </Field>
        <Field data-invalid={!!form.formState.errors.environment}>
          <FieldLabel htmlFor="app-env">
            新增或更新环境变量（每行 NAME=value，按秘密保存）
          </FieldLabel>
          <Textarea
            id="app-env"
            {...form.register("environment")}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={!!form.formState.errors.environment}
          />
          <FieldError>{form.formState.errors.environment?.message}</FieldError>
        </Field>
        {app?.environmentKeys.map((entry) => (
          <Controller
            key={entry.name}
            name="removeKeys"
            control={form.control}
            render={({ field }) => (
              <Field orientation="horizontal">
                <Checkbox
                  id={"env-" + entry.name}
                  checked={field.value.includes(entry.name)}
                  onCheckedChange={(checked) =>
                    field.onChange(
                      checked
                        ? [...field.value, entry.name]
                        : field.value.filter((key) => key !== entry.name),
                    )
                  }
                />
                <FieldLabel htmlFor={"env-" + entry.name}>
                  移除 {entry.name}（已有值不回显）
                </FieldLabel>
              </Field>
            )}
          />
        ))}
      </FieldGroup>
      <Button type="submit">预检并核对影响</Button>
    </form>
  );
}
/** AppsPage 将可操作托管应用和只读系统进程分开。 */
export function AppsPage() {
  const timeZone = useDisplayTimezone();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "processes" ? "processes" : "managed";
  const [creating, setCreating] = useState(false);
  const [draftDirty, setDraftDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [operation, setOperation] = useState<OperationSpec | null>(null);
  const apps = useQuery({ ...appsQuery, enabled: tab === "managed" });
  const bootstrap = useQuery(bootstrapQuery);
  const processes = useQuery({
    ...processesQuery(
      params.get("search") ?? "",
      params.get("sort") ?? "cpu",
      params.get("cursor") ?? "",
    ),
    enabled: tab === "processes",
  });
  /** 输入不直接触发系统动作，搜索只过滤进程快照。 */
  function filter(key: string, value: string) {
    setParams(
      (previous) => {
        previous.set(key, value);
        if (key !== "cursor") previous.delete("cursor");
        return previous;
      },
      { replace: key === "search" },
    );
  }
  return (
    <div className="page-stack">
      <PageHeading
        title="应用与进程"
        description="托管应用可控制；未托管系统进程仅供查看"
        action={
          tab === "managed" && (
            <Button
              disabled={!bootstrap.data?.capabilities.manageApps.enabled}
              onClick={() => setCreating(true)}
            >
              <Plus data-icon="inline-start" />
              新建应用
            </Button>
          )
        }
      />
      <Tabs value={tab} onValueChange={(value) => filter("tab", String(value))}>
        <TabsList variant="line">
          <TabsTrigger value="managed">托管应用</TabsTrigger>
          <TabsTrigger value="processes">系统进程</TabsTrigger>
        </TabsList>
      </Tabs>
      <Card>
        <CardHeader>
          <CardTitle>{tab === "managed" ? "托管应用" : "系统进程"}</CardTitle>
          <CardDescription>
            {tab === "managed"
              ? "CPU 和内存按服务 cgroup 汇总，不等同于主 PID"
              : "CPU 以单核为 100%，多线程进程可超过 100%"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tab === "managed" ? (
            <QueryState
              pending={apps.isPending}
              error={apps.error}
              retry={() => void apps.refetch()}
            >
              <DataTable
                headers={[
                  "应用",
                  "类型 / 绑定",
                  "状态",
                  "PID",
                  "CPU",
                  "内存",
                  "操作",
                ]}
                rows={(apps.data?.items ?? []).map((app) => ({
                  id: app.id,
                  cells: [
                    <Button
                      nativeButton={false}
                      variant="link"
                      render={<Link to={`/apps/${app.id}`} />}
                    >
                      {app.name}
                    </Button>,
                    <code>
                      {app.execution.kind === "node" ? "Node.js" : "二进制"}
                    </code>,
                    <Status status={app.status} />,
                    app.mainPid ?? "—",
                    app.cpuUsagePercent === null
                      ? "—"
                      : `${app.cpuUsagePercent.toFixed(1)}%`,
                    formatBytes(app.memoryBytes),
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          !bootstrap.data?.capabilities.manageApps.enabled
                        }
                        onClick={() =>
                          setOperation({
                            action:
                              app.status === "stopped" ||
                              app.status === "failed"
                                ? "app.start"
                                : "app.stop",
                            appId: app.id,
                            expectedRevision: app.revision,
                          })
                        }
                      >
                        {app.status === "stopped" || app.status === "failed"
                          ? "启动"
                          : "停止"}
                      </Button>
                      <Button
                        nativeButton={false}
                        size="sm"
                        variant="ghost"
                        render={<Link to={`/logs?source=app:${app.id}`} />}
                      >
                        日志
                      </Button>
                    </div>,
                  ],
                }))}
                empty="尚未登记托管应用"
              />
            </QueryState>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <InputGroup className="max-w-sm">
                  <InputGroupAddon>
                    <Search aria-hidden="true" />
                  </InputGroupAddon>
                  <InputGroupInput
                    aria-label="搜索进程名称或 PID"
                    placeholder="搜索名称或 PID…"
                    value={params.get("search") ?? ""}
                    onChange={(event) => filter("search", event.target.value)}
                  />
                </InputGroup>
                <Choice
                  label="排序"
                  value={params.get("sort") ?? "cpu"}
                  onChange={(value) => filter("sort", value)}
                  options={[
                    { value: "cpu", label: "CPU 降序" },
                    { value: "memory", label: "内存降序" },
                    { value: "pid", label: "PID" },
                  ]}
                />
              </div>
              <QueryState
                pending={processes.isPending}
                error={processes.error}
                retry={() => void processes.refetch()}
              >
                <DataTable
                  headers={[
                    "PID",
                    "名称",
                    "用户",
                    "CPU",
                    "RSS",
                    "启动时间",
                    "父 PID",
                    "关联应用",
                  ]}
                  rows={(processes.data?.items ?? []).map((item) => ({
                    id: item.processKey,
                    cells: [
                      <code>{item.pid}</code>,
                      item.name,
                      item.user ?? "不可用",
                      item.cpuPercent === null
                        ? "采集中"
                        : `${item.cpuPercent.toFixed(1)}%`,
                      formatBytes(item.rssBytes),
                      formatTime(item.startedAt, timeZone),
                      item.ppid,
                      item.appId ? (
                        <Button
                          nativeButton={false}
                          variant="link"
                          render={<Link to={`/apps/${item.appId}`} />}
                        >
                          打开应用
                        </Button>
                      ) : (
                        "未托管"
                      ),
                    ],
                  }))}
                />
                {processes.data?.nextCursor && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      filter("cursor", processes.data?.nextCursor ?? "")
                    }
                  >
                    下一页
                  </Button>
                )}
                {params.get("cursor") && (
                  <Button variant="ghost" onClick={() => filter("cursor", "")}>
                    返回第一页
                  </Button>
                )}
              </QueryState>
            </div>
          )}
        </CardContent>
      </Card>
      <Sheet
        open={creating}
        onOpenChange={(open) => {
          if (!open && draftDirty) setDiscardOpen(true);
          else setCreating(open);
        }}
      >
        <SheetContent className="w-full sm:max-w-[640px]">
          <SheetHeader>
            <SheetTitle>新建托管应用</SheetTitle>
            <SheetDescription>
              文件必须已经存在于允许目录，不执行上传、拉取或安装依赖。
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
            <AppForm
              onDirtyChange={setDraftDirty}
              onReview={(next) => {
                setCreating(false);
                setOperation(next);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>放弃未提交的应用配置？</AlertDialogTitle>
            <AlertDialogDescription>
              关闭会清除当前草稿和未提交的环境秘密。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续编辑</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDraftDirty(false);
                setCreating(false);
              }}
            >
              放弃修改
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <OperationSheet
        operation={operation}
        onClose={() => setOperation(null)}
      />
    </div>
  );
}
/** AppDetailPage 将配置保存、服务重启和日志读取作为不同动作。 */
export function AppDetailPage() {
  const timeZone = useDisplayTimezone();
  const { appId = "" } = useParams();
  const app = useQuery(appQuery(appId));
  const bootstrap = useQuery(bootstrapQuery);
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "overview";
  const [operation, setOperation] = useState<OperationSpec | null>(null);
  const item: ManagedApp | undefined = app.data;
  return (
    <div className="page-stack">
      <PageHeading
        title={item?.name ?? "应用详情"}
        description={item?.unitName}
        action={
          item && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={!bootstrap.data?.capabilities.manageApps.enabled}
                onClick={() =>
                  setOperation({
                    action: "app.restart",
                    appId,
                    expectedRevision: item.revision,
                  })
                }
              >
                重启预检
              </Button>
              <Button
                nativeButton={false}
                variant="outline"
                render={<Link to={`/logs?source=app:${appId}`} />}
              >
                查看日志
              </Button>
            </div>
          )
        }
      />
      <QueryState
        pending={app.isPending}
        error={app.error}
        retry={() => void app.refetch()}
      >
        {item && (
          <>
            {item.pendingRestart && (
              <Alert>
                <AlertTitle>已保存，等待下次启动生效</AlertTitle>
                <AlertDescription>
                  要立即应用配置，请单独核对并确认重启。
                </AlertDescription>
              </Alert>
            )}
            <Tabs
              value={tab}
              onValueChange={(value) => setParams({ tab: String(value) })}
            >
              <TabsList>
                <TabsTrigger value="overview">概况</TabsTrigger>
                <TabsTrigger value="config">配置</TabsTrigger>
                <TabsTrigger value="logs">日志</TabsTrigger>
              </TabsList>
            </Tabs>
            {tab === "logs" ? (
              <LogsPage sourceId={`app:${appId}`} embedded />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>
                    {tab === "config" ? "应用配置" : "运行概况"}
                  </CardTitle>
                  <CardDescription>面板只管理已登记的服务单元</CardDescription>
                </CardHeader>
                <CardContent>
                  {tab === "config" ? (
                    <AppForm
                      key={item.revision}
                      app={item}
                      onReview={setOperation}
                    />
                  ) : (
                    <div className="flex flex-col gap-5">
                      <dl className="detail-grid text-sm">
                        <dt>状态</dt>
                        <dd>
                          <Status status={item.status} />
                        </dd>
                        <dt>应用目录</dt>
                        <dd>
                          <CopyText value={item.workingDirectory} />
                        </dd>
                        <dt>服务账号</dt>
                        <dd>{item.runAsUser}</dd>
                        <dt>主 PID</dt>
                        <dd>{item.mainPid ?? "—"}</dd>
                        <dt>启动时间</dt>
                        <dd>{formatTime(item.startedAt, timeZone)}</dd>
                        <dt>内存</dt>
                        <dd>{formatBytes(item.memoryBytes)}</dd>
                        <dt>环境变量</dt>
                        <dd>
                          {item.environmentKeys
                            .map((entry) => entry.name)
                            .join("、") || "未配置"}
                        </dd>
                      </dl>
                      <Button
                        variant="destructive"
                        disabled={
                          item.status !== "stopped" ||
                          !bootstrap.data?.capabilities.manageApps.enabled
                        }
                        onClick={() =>
                          setOperation({
                            action: "app.delete",
                            appId,
                            expectedRevision: item.revision,
                          })
                        }
                      >
                        移除托管配置
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </QueryState>
      <OperationSheet
        operation={operation}
        onClose={() => setOperation(null)}
      />
    </div>
  );
}
