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
};

/**
 * LoginResult 描述登录成功后返回的会话和用户信息。
 * token 只保存于当前浏览器会话。
 */
export type LoginResult = {
  token: string;
  expiresAt: string;
  user: AuthUser;
};

/**
 * LoginFormValues 描述登录表单提交给后端的字段。
 * 字段长度与后端登录请求校验保持一致。
 */
export type LoginFormValues = {
  username: string;
  password: string;
};

/**
 * LoginLocationState 保存鉴权守卫传给登录页的原始访问路径。
 * from 保持 unknown，登录成功前仍需执行安全类型检查。
 */
export type LoginLocationState = {
  from?: unknown;
};
