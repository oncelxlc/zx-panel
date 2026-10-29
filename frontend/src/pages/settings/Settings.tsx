import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "@/lib/toast";
import { useThemeMode } from "@/theme/themeContext";
import { queryClient, settingsQuery } from "@/features/panel/queries";
import { PageHeading, QueryState } from "@/features/panel/Shared";
import { request } from "@/lib/api/client";
import { settingsSchema } from "@/lib/api/schemas";
import { formatBytes } from "@/lib/format";
import { clearAuthToken } from "@/auth/session";
import { logout } from "@/auth/api";
import type {
  PasswordFormValues,
  PreferencesFormProps,
  SettingsFormValues,
} from "@/types/settings-form.type";
/** preferencesSchema 与服务器允许的保留范围保持一致。 */
const preferencesSchema = z.object({
  displayTimezone: z.string().refine((value) => {
    if (value === "server" || value === "browser") return true;
    try {
      new Intl.DateTimeFormat("zh-CN", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, "使用 server、browser 或有效 IANA 时区"),
  metricsRetentionHours: z.number().int().min(1).max(24),
  taskRetentionDays: z.number().int().min(1).max(90),
  auditRetentionDays: z.number().int().min(7).max(365),
});
/** passwordSchema 按 bcrypt 的 UTF-8 字节上限校验，不裁剪密码。 */
const passwordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z
      .string()
      .min(12, "新密码至少 12 个字符")
      .refine((value) => Array.from(value).length >= 12, "新密码至少 12 个字符")
      .refine(
        (value) => new TextEncoder().encode(value).length <= 72,
        "新密码最多 72 个 UTF-8 字节",
      ),
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "两次密码不一致",
    path: ["confirmPassword"],
  });
/** PreferencesForm 通过 expectedRevision 防止覆盖其他标签页的新设置。 */
function PreferencesForm({ settings }: PreferencesFormProps) {
  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(preferencesSchema),
    defaultValues: {
      displayTimezone: settings.displayTimezone,
      metricsRetentionHours: settings.metricsRetentionHours,
      taskRetentionDays: settings.taskRetentionDays,
      auditRetentionDays: settings.auditRetentionDays,
    },
  });
  const save = useMutation({
    mutationFn: (values: SettingsFormValues) =>
      request("/settings", settingsSchema, {
        method: "PATCH",
        body: JSON.stringify({
          ...values,
          expectedRevision: settings.revision,
        }),
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(["settings"], result);
      toast.add({ title: "设置已保存", type: "success" });
    },
  });
  return (
    <form onSubmit={form.handleSubmit((values) => save.mutate(values))}>
      <FieldGroup>
        <Field data-invalid={!!form.formState.errors.displayTimezone}>
          <FieldLabel htmlFor="display-timezone">
            显示时区（server / browser / IANA 名称）
          </FieldLabel>
          <Input
            id="display-timezone"
            {...form.register("displayTimezone")}
            aria-invalid={!!form.formState.errors.displayTimezone}
          />
          <FieldError>
            {form.formState.errors.displayTimezone?.message}
          </FieldError>
        </Field>
        {(
          [
            {
              key: "metricsRetentionHours",
              label: "监控历史保留（1–24 小时）",
              min: 1,
              max: 24,
            },
            {
              key: "taskRetentionDays",
              label: "任务记录保留（1–90 天）",
              min: 1,
              max: 90,
            },
            {
              key: "auditRetentionDays",
              label: "审计保留（7–365 天）",
              min: 7,
              max: 365,
            },
          ] as const
        ).map((item) => (
          <Field
            key={item.key}
            data-invalid={!!form.formState.errors[item.key]}
          >
            <FieldLabel htmlFor={item.key}>{item.label}</FieldLabel>
            <Input
              id={item.key}
              type="number"
              min={item.min}
              max={item.max}
              {...form.register(item.key, { valueAsNumber: true })}
              aria-invalid={!!form.formState.errors[item.key]}
            />
            <FieldError>{form.formState.errors[item.key]?.message}</FieldError>
          </Field>
        ))}
        <QueryState error={save.error} />
        <Button
          type="submit"
          disabled={save.isPending || !form.formState.isDirty}
        >
          {save.isPending ? "正在保存…" : "保存设置"}
        </Button>
      </FieldGroup>
    </form>
  );
}
/** PasswordForm 改密后关闭当前会话并要求重新登录。 */
function PasswordForm() {
  const navigate = useNavigate();
  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });
  const save = useMutation({
    mutationFn: (values: PasswordFormValues) =>
      request("/auth/password", z.object({ changed: z.boolean() }), {
        method: "POST",
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
      }),
    onSuccess: () => {
      form.reset();
      clearAuthToken();
      queryClient.clear();
      navigate("/login", { replace: true });
    },
  });
  return (
    <form onSubmit={form.handleSubmit((values) => save.mutate(values))}>
      <FieldGroup>
        {(
          [
            {
              key: "currentPassword",
              label: "当前密码",
              auto: "current-password",
            },
            { key: "newPassword", label: "新密码", auto: "new-password" },
            {
              key: "confirmPassword",
              label: "确认新密码",
              auto: "new-password",
            },
          ] as const
        ).map((item) => (
          <Field
            key={item.key}
            data-invalid={!!form.formState.errors[item.key]}
          >
            <FieldLabel htmlFor={item.key}>{item.label}</FieldLabel>
            <Input
              id={item.key}
              type="password"
              autoComplete={item.auto}
              {...form.register(item.key)}
              aria-invalid={!!form.formState.errors[item.key]}
            />
            <FieldError>{form.formState.errors[item.key]?.message}</FieldError>
          </Field>
        ))}
        <QueryState error={save.error} />
        <Button type="submit" disabled={save.isPending}>
          修改密码并撤销旧会话
        </Button>
      </FieldGroup>
    </form>
  );
}
/** SettingsPage 区分浏览器外观偏好、服务器设置与账号安全。 */
export function SettingsPage() {
  const settings = useQuery(settingsQuery);
  const { preference, setPreference } = useThemeMode();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  /** 退出失败保持当前会话并提示重试。 */
  async function leave() {
    setLeaving(true);
    try {
      await logout();
      queryClient.clear();
      navigate("/login", { replace: true });
    } catch (error) {
      toast.add({
        title: error instanceof Error ? error.message : "退出失败",
        type: "error",
      });
    } finally {
      setLeaving(false);
    }
  }
  return (
    <div className="page-stack max-w-4xl">
      <PageHeading
        title="设置"
        description="只调整面板本身，不修改主机系统配置"
      />
      <Card>
        <CardHeader>
          <CardTitle>外观</CardTitle>
          <CardDescription>
            浏览器偏好即时保存；登录与初始化页始终跟随系统
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ToggleGroup
            value={[preference]}
            onValueChange={(values) => {
              const value = values[0];
              if (value === "light" || value === "dark" || value === "system")
                setPreference(value);
            }}
            variant="outline"
            aria-label="主题偏好"
          >
            <ToggleGroupItem value="light">亮色</ToggleGroupItem>
            <ToggleGroupItem value="dark">暗色</ToggleGroupItem>
            <ToggleGroupItem value="system">跟随系统</ToggleGroupItem>
          </ToggleGroup>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>数据显示与保留</CardTitle>
          <CardDescription>
            保留策略只影响未来数据，不能恢复已删除历史
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QueryState
            pending={settings.isPending}
            error={settings.error}
            retry={() => void settings.refetch()}
          >
            {settings.data && (
              <PreferencesForm
                key={settings.data.revision}
                settings={settings.data}
              />
            )}
          </QueryState>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>账号安全</CardTitle>
          <CardDescription>
            修改密码会立即撤销已有会话及实时连接
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
          <div className="mt-5">
            <Button
              variant="outline"
              disabled={leaving}
              onClick={() => void leave()}
            >
              {leaving ? "正在退出…" : "退出登录"}
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>关于 zx-panel</CardTitle>
          <CardDescription>
            单服务器管理 · Go + Gin · PostgreSQL
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="detail-grid text-sm">
            <dt>版本</dt>
            <dd>{settings.data?.version ?? "读取中"}</dd>
            <dt>监控数据占用</dt>
            <dd>{formatBytes(settings.data?.storageBytes)}</dd>
            <dt>运行时目录</dt>
            <dd>
              <code>{settings.data?.runtimeRoot ?? "读取中"}</code>
              （部署配置，只读）
            </dd>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
