import { z } from "zod";
import { clearAuthToken, getCSRFToken } from "@/auth/session";

/** envelopeSchema 校验统一响应外壳，业务 data 由独立 Schema 验证。 */
const envelopeSchema = z.object({
  success: z.boolean(),
  data: z.unknown(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
  meta: z.object({ requestId: z.string(), serverTime: z.string() }),
});

/** ApiError 将安全公开消息与请求标识交给页面。 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;
  /** 不拼接响应正文，防止秘密或代理 HTML 泄漏。 */
  constructor(status: number, code: string, message: string, requestId = "") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

/** request 使用同源 Cookie、写请求 CSRF 和运行时 Schema 验证。 */
export async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.method && !["GET", "HEAD"].includes(init.method)) {
    headers.set("Content-Type", "application/json");
    headers.set("X-CSRF-Token", getCSRFToken());
  }
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      ...init,
      credentials: "same-origin",
      headers,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ApiError(0, "NETWORK_ERROR", "无法连接面板服务，请稍后重试");
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new ApiError(
      response.status,
      "INVALID_RESPONSE",
      "服务返回了无法读取的响应",
    );
  }
  const parsed = envelopeSchema.safeParse(raw);
  if (response.status === 401) clearAuthToken();
  if (!parsed.success)
    throw new ApiError(
      response.status,
      "INVALID_RESPONSE",
      "服务响应不符合接口契约",
    );
  if (!response.ok || !parsed.data.success)
    throw new ApiError(
      response.status,
      parsed.data.error?.code ?? "REQUEST_FAILED",
      parsed.data.error?.message ?? "请求失败",
      parsed.data.meta.requestId,
    );
  const data = schema.safeParse(parsed.data.data);
  if (!data.success)
    throw new ApiError(
      response.status,
      "INVALID_RESPONSE",
      "数据结构异常，请使用请求编号排查",
      parsed.data.meta.requestId,
    );
  return data.data;
}
