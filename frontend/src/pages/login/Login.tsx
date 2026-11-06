import { iconStyles } from "@/components/ui/icon.styles";
import { ApiError, login } from "@/auth/api";
import {
  queryClient,
  sessionQuery,
  setupStatusQuery,
} from "@/features/panel/queries";
import { useQuery } from "@tanstack/react-query";
import { getLoginTarget, validateLoginForm } from "@/auth/loginForm";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import type { LoginFormErrors, LoginFormValues } from "@/types/auth.type";
import { Eye, EyeOff } from "lucide-react";
import { useRef, useState } from "react";
import type { ChangeEvent, FocusEvent, FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { styleProps } from "@/lib/styleProps";
import { styles as dialogStyles } from "@/components/ui/dialog.styles";
import { styles as fieldStyles } from "@/components/ui/field.styles";
import { styles } from "./Login.styles";
import { LoginBackground } from "./LoginBackground";

/** 渲染公开登录表单；认证与令牌存储交给 API 客户端，页面负责反馈和安全回跳。 */
export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState<LoginFormValues>({
    username: "",
    password: "",
  });
  const [errors, setErrors] = useState<LoginFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const setupStatus = useQuery(setupStatusQuery);

  /** 同步输入并重新校验已报错的字段，未交互字段不提前显示错误。 */
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.currentTarget;
    if (name !== "username" && name !== "password") return;
    const nextValues = { ...values, [name]: value };
    setValues(nextValues);
    if (errors[name]) {
      setErrors({ ...errors, [name]: validateLoginForm(nextValues)[name] });
    }
  }

  /** 字段失焦后展示局部校验结果，支持键盘和鼠标切换输入。 */
  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    const { name } = event.currentTarget;
    if (name !== "username" && name !== "password") return;
    setErrors((previous) => ({
      ...previous,
      [name]: validateLoginForm(values)[name],
    }));
  }

  /** 提交前读取实际表单值以兼容密码管理器，并在请求期间阻止重复提交。 */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    const form = new FormData(event.currentTarget);
    const username = form.get("username");
    const password = form.get("password");
    const submittedValues = {
      username: typeof username === "string" ? username : "",
      password: typeof password === "string" ? password : "",
    };
    const nextErrors = validateLoginForm(submittedValues);
    setValues(submittedValues);
    setErrors(nextErrors);
    if (nextErrors.username || nextErrors.password) {
      (nextErrors.username ? usernameRef : passwordRef).current?.focus();
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await login(submittedValues.username, submittedValues.password);
      // 登录页的会话查询已不活跃，跳转前必须完成刷新，避免守卫沿用匿名缓存。
      await queryClient.fetchQuery({ ...sessionQuery, staleTime: 0 });
      const state: unknown = location.state;
      const from =
        state && typeof state === "object" && "from" in state
          ? state.from
          : undefined;
      navigate(getLoginTarget(from, window.location.origin), { replace: true });
    } catch (error) {
      toast.add({
        id: "login-error",
        title:
          error instanceof ApiError ? error.message : "登录失败，请稍后重试",
        description:
          error instanceof ApiError && error.requestId
            ? `请求编号：${error.requestId}`
            : undefined,
        type: "error",
      });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (setupStatus.data?.setupRequired) return <Navigate to="/setup" replace />;
  return (
    <main {...styleProps(styles.page, "login-page")}>
      <LoginBackground />
      <header {...styleProps(styles.header)}>
        <Item xstyle={styles.brand}>
          <ItemMedia variant="image">
            <img
              src="/icons/android-chrome-192x192.png"
              width={40}
              height={40}
              alt=""
            />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>ZX PANEL</ItemTitle>
          </ItemContent>
        </Item>
      </header>
      <div {...styleProps(styles.body)}>
        <section
          {...styleProps(styles.panel)}
          data-slot="login-panel"
          aria-labelledby="login-title"
        >
          <Card size="lg" variant="glass" xstyle={styles.card}>
            <CardHeader xstyle={styles.cardHeader}>
              <ItemMedia variant="image" aria-hidden="true">
                <img
                  src="/icons/android-chrome-192x192.png"
                  width={40}
                  height={40}
                  alt=""
                />
              </ItemMedia>
              <CardTitle id="login-title" role="heading" aria-level={1}>
                欢迎回来
              </CardTitle>
            </CardHeader>
            <CardContent xstyle={styles.cardContent}>
              <form onSubmit={handleSubmit} noValidate aria-busy={submitting}>
                <FieldGroup xstyle={styles.fields}>
                  <Field
                    xstyle={styles.field}
                    data-invalid={Boolean(errors.username)}
                    data-disabled={submitting}
                  >
                    <FieldLabel htmlFor="username">账号</FieldLabel>
                    <Input
                      xstyle={styles.control}
                      ref={usernameRef}
                      id="username"
                      name="username"
                      value={values.username}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                      disabled={submitting}
                      aria-invalid={Boolean(errors.username)}
                      aria-describedby={
                        errors.username ? "username-error" : undefined
                      }
                    />
                    <FieldError
                      id="username-error"
                      xstyle={fieldStyles.errorCompact}
                    >
                      {errors.username}
                    </FieldError>
                  </Field>
                  <Field
                    xstyle={styles.field}
                    data-invalid={Boolean(errors.password)}
                    data-disabled={submitting}
                  >
                    <FieldLabel htmlFor="password">密码</FieldLabel>
                    <InputGroup xstyle={styles.control}>
                      <InputGroupInput
                        xstyle={styles.password}
                        ref={passwordRef}
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        value={values.password}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        autoComplete="current-password"
                        required
                        disabled={submitting}
                        aria-invalid={Boolean(errors.password)}
                        aria-describedby={
                          errors.password ? "password-error" : undefined
                        }
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupButton
                          size="icon-sm"
                          xstyle={styles.reveal}
                          onClick={() => setShowPassword(!showPassword)}
                          disabled={submitting}
                          aria-label={showPassword ? "隐藏密码" : "显示密码"}
                          aria-pressed={showPassword}
                        >
                          {showPassword ? (
                            <EyeOff
                              {...styleProps(iconStyles.root)}
                              aria-hidden="true"
                            />
                          ) : (
                            <Eye
                              {...styleProps(iconStyles.root)}
                              aria-hidden="true"
                            />
                          )}
                        </InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                    <FieldError
                      id="password-error"
                      xstyle={fieldStyles.errorCompact}
                    >
                      {errors.password}
                    </FieldError>
                  </Field>
                  <Button
                    xstyle={styles.submit}
                    type="submit"
                    disabled={submitting}
                  >
                    {submitting && (
                      <Spinner data-icon="inline-start" aria-hidden="true" />
                    )}
                    {submitting ? "正在登录…" : "登录控制台"}
                  </Button>
                </FieldGroup>
                <span {...styleProps(dialogStyles.hidden)} role="status">
                  {submitting ? "正在登录，请稍候" : ""}
                </span>
              </form>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
