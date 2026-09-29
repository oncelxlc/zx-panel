/**
 * AuthUser 描述后端允许暴露给前端的当前用户信息。
 * 密码摘要和会话令牌等敏感字段不会进入该类型。
 */
export type AuthUser = {
  id: number;
  username: string;
  displayName: string;
  role: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * ApiErrorPayload 描述统一 API 响应中的业务错误。
 * code 用于程序判断，message 用于界面提示。
 */
export type ApiErrorPayload = {
  code: string;
  message: string;
};

/**
 * ApiResponse 对应后端 success、data、error 的统一响应结构。
 * 泛型参数表示成功响应的业务数据。
 */
export type ApiResponse<T> = {
  success: boolean;
  data: T;
  error: ApiErrorPayload | null;
  meta: { requestId: string; serverTime: string };
};

/**
 * LoginResult 描述登录成功后返回的会话和用户信息。
 * 认证 Cookie 不向脚本公开，CSRF 值只在当前页面内存中使用。
 */
export type LoginResult = {
  expiresAt: string;
  user: AuthUser;
  csrfToken: string;
};

/** SessionResult 只公开会话状态和 CSRF 值，不向脚本返回认证 Cookie。 */
export type SessionResult = {
  authenticated: boolean;
  user: AuthUser | null;
  csrfToken: string;
  expiresAt: string | null;
};

/**
 * LoginFormValues 描述登录表单提交给后端的字段。
 * 字段长度与后端登录请求校验保持一致。
 */
export type LoginFormValues = {
  username: string;
  password: string;
};

/** 登录表单逐字段的校验消息；缺失的字段表示当前没有错误。 */
export type LoginFormErrors = Partial<Record<keyof LoginFormValues, string>>;

/**
 * LoginLocationState 保存鉴权守卫传给登录页的原始访问路径。
 * from 保持 unknown，登录成功前仍需执行安全类型检查。
 */
export type LoginLocationState = {
  from?: unknown;
};
