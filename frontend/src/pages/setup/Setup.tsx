import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router";
import { z } from "zod";
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
import { QueryState } from "@/features/panel/Shared";
import { queryClient, setupStatusQuery } from "@/features/panel/queries";
import { request } from "@/lib/api/client";
import { getSession } from "@/auth/api";
import type { SetupFormValues } from "@/types/settings-form.type";
/** setupSchema 限制管理员账号并按密码字节上限检查。 */
const setupSchema = z
  .object({
    token: z.string().length(43, "请输入完整的本机初始化凭据"),
    username: z
      .string()
      .regex(
        /^[A-Za-z0-9_.-]{3,32}$/,
        "账号使用 3–32 个字母、数字、点、下划线或短横线",
      ),
    password: z
      .string()
      .min(12, "密码至少 12 个字符")
      .refine((value) => Array.from(value).length >= 12, "密码至少 12 个字符")
      .refine(
        (value) => new TextEncoder().encode(value).length <= 72,
        "密码最多 72 个 UTF-8 字节",
      ),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "两次密码不一致",
    path: ["confirmPassword"],
  });
/** SetupPage 只能消费本机 CLI 短期凭据，不能匿名抢注管理员。 */
export function SetupPage() {
  const navigate = useNavigate();
  const status = useQuery(setupStatusQuery);
  const form = useForm<SetupFormValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      token: "",
      username: "",
      password: "",
      confirmPassword: "",
    },
  });
  const setup = useMutation({
    mutationFn: async (values: SetupFormValues) => {
      await getSession();
      return request("/auth/setup", z.object({ initialized: z.boolean() }), {
        method: "POST",
        body: JSON.stringify({
          token: values.token,
          username: values.username,
          password: values.password,
        }),
      });
    },
    onSuccess: () => {
      form.reset();
      queryClient.clear();
      navigate("/login", { replace: true });
    },
  });
  if (status.data && !status.data.setupRequired)
    return <Navigate to="/login" replace />;
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle role="heading" aria-level={1}>
            初始化 zx-panel
          </CardTitle>
          <CardDescription>
            在服务器本机运行 setup-token 命令取得短期凭据。凭据不放入
            URL，也不要分享给他人。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QueryState
            pending={status.isPending}
            error={status.error}
            retry={() => void status.refetch()}
          >
            <form
              onSubmit={form.handleSubmit((values) => setup.mutate(values))}
            >
              <FieldGroup>
                {(
                  [
                    {
                      key: "token",
                      label: "一次性初始化凭据",
                      type: "password",
                      auto: "off",
                    },
                    {
                      key: "username",
                      label: "管理员账号",
                      type: "text",
                      auto: "username",
                    },
                    {
                      key: "password",
                      label: "密码",
                      type: "password",
                      auto: "new-password",
                    },
                    {
                      key: "confirmPassword",
                      label: "确认密码",
                      type: "password",
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
                      type={item.type}
                      autoComplete={item.auto}
                      {...form.register(item.key)}
                      aria-invalid={!!form.formState.errors[item.key]}
                    />
                    <FieldError>
                      {form.formState.errors[item.key]?.message}
                    </FieldError>
                  </Field>
                ))}
                <QueryState error={setup.error} />
                <Button type="submit" disabled={setup.isPending}>
                  {setup.isPending ? "正在初始化…" : "创建管理员"}
                </Button>
              </FieldGroup>
            </form>
          </QueryState>
        </CardContent>
      </Card>
    </main>
  );
}
