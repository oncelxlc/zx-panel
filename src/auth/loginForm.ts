import type { LoginFormErrors, LoginFormValues } from "@/types/auth.type";

/** 校验登录字段；密码按后端的 Unicode 字符长度计数，不裁剪用户输入。 */
export function validateLoginForm(values: LoginFormValues): LoginFormErrors {
  const errors: LoginFormErrors = {};
  if (!values.username) {
    errors.username = "请输入账号";
  } else if (values.username.length < 3 || values.username.length > 32) {
    errors.username = "账号长度应为 3–32 个字符";
  } else if (!/^[A-Za-z0-9_.-]+$/.test(values.username)) {
    errors.username = "账号仅支持字母、数字、下划线、点和短横线";
  }
  const passwordLength = [...values.password].length;
  if (!passwordLength) {
    errors.password = "请输入密码";
  } else if (passwordLength < 6 || passwordLength > 72) {
    errors.password = "密码长度应为 6–72 个字符";
  }
  return errors;
}

/** 规范化登录回跳路径，仅允许当前来源的站内绝对路径并保留查询与锚点。 */
export function getLoginTarget(requestedPath: unknown, origin: string): string {
  if (
    typeof requestedPath !== "string" ||
    !requestedPath.startsWith("/") ||
    requestedPath.startsWith("//")
  ) {
    return "/";
  }
  try {
    const target = new URL(requestedPath, origin);
    // 拦截反斜杠等 URL 规范化绕过，返回值也不能变成协议相对地址。
    if (target.origin !== origin || target.pathname.startsWith("//"))
      return "/";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/";
  }
}
