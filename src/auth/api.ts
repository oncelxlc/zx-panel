import { clearAuthToken, getAuthToken, setAuthToken } from "@/auth/session";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export type AuthUser = {
  id: number;
  username: string;
  displayName: string;
  role: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type ApiErrorPayload = { code: string; message: string };
type ApiResponse<T> = { success: boolean; data: T; error: ApiErrorPayload | null };
type LoginResult = { token: string; expiresAt: string; user: AuthUser };

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

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

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {...init, headers});
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "无法连接后端服务，请稍后重试");
  }

  let payload: ApiResponse<T> | null = null;
  try {
    payload = await response.json() as ApiResponse<T>;
  } catch {
    // 非 JSON 响应会在下方转换为稳定的客户端错误。
  }
  if (!response.ok || !payload?.success) {
    if (response.status === 401) {
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

export async function login(username: string, password: string) {
  const result = await request<LoginResult>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({username, password}),
  }, false);
  setAuthToken(result.token);
  return result;
}

export async function getCurrentUser(signal?: AbortSignal) {
  const result = await request<{user: AuthUser}>("/api/v1/auth/me", {signal});
  return result.user;
}

export async function logout() {
  try {
    await request<{loggedOut: boolean}>("/api/v1/auth/logout", {method: "POST"});
  } finally {
    clearAuthToken();
  }
}
