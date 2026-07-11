import { clearAuthToken, getAuthToken, setAuthToken } from "@/auth/session";
import type {
  ApiResponse,
  AuthUser,
  LoginResult,
} from "@/types/auth.type";

/**
 * API_BASE_URL 是前端请求后端接口时使用的可选基础地址。
 * 空值表示使用同源地址，并由开发代理转发 `/api` 请求。
 */
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

/**
 * ApiError 将 HTTP 状态、业务错误码和可展示消息统一封装。
 * 调用方可区分网络错误、未认证和其他业务失败。
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  /**
   * constructor 创建稳定的前端 API 错误对象。
   * status 为零时表示请求未获得 HTTP 响应。
   */
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * request 执行统一 JSON API 请求并解析后端响应结构。
 * 认证请求会自动附加令牌，401 会清理全局登录状态。
 */
async function request<T>(path: string, init: RequestInit = {}, authenticated = true) {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = authenticated ? getAuthToken() : null;
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // 网络错误转换为稳定错误，避免页面依赖浏览器原始异常文本。
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {...init, headers});
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "无法连接后端服务，请稍后重试");
  }

  // 响应可能不是 JSON，解析失败时保留统一的兜底错误。
  let payload: ApiResponse<T> | null = null;
  try {
    payload = await response.json() as ApiResponse<T>;
  } catch {
    // 非 JSON 响应会在下方转换为稳定的客户端错误。
  }
  if (!response.ok || !payload?.success) {
    if (response.status === 401) {
      // 服务端拒绝会话时立即触发全局未登录流程。
      clearAuthToken();
    }
    throw new ApiError(
      response.status,
      payload?.error?.code ?? "REQUEST_FAILED",
      payload?.error?.message ?? "请求失败，请稍后重试",
    );
  }
  return payload.data;
}

/**
 * login 提交账号密码并保存服务端返回的会话令牌。
 * 登录接口本身不会携带已有认证头。
 */
export async function login(username: string, password: string) {
  const result = await request<LoginResult>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({username, password}),
  }, false);
  setAuthToken(result.token);
  return result;
}

/**
 * getCurrentUser 校验当前令牌并返回服务端用户信息。
 * 可选 AbortSignal 用于组件卸载时取消过期请求。
 */
export async function getCurrentUser(signal?: AbortSignal) {
  const result = await request<{user: AuthUser}>("/api/v1/auth/me", {signal});
  return result.user;
}

/**
 * logout 请求服务端注销当前会话并始终清理本地令牌。
 * 即使网络失败，浏览器也会立即退出本地登录状态。
 */
export async function logout() {
  try {
    await request<{loggedOut: boolean}>("/api/v1/auth/logout", {method: "POST"});
  } finally {
    // 服务端失败不能阻止用户退出当前浏览器会话。
    clearAuthToken();
  }
}
