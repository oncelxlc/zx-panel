import { z } from "zod";
import { clearAuthToken, setCSRFToken } from "@/auth/session";
import { request } from "@/lib/api/client";
export { ApiError } from "@/lib/api/client";

/** userSchema 限定公开字段，密码摘要不能进入页面缓存。 */
const userSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  displayName: z.string(),
  role: z.string(),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
/** sessionSchema 用于登录前与已登录的同一握手接口。 */
export const sessionSchema = z.object({
  authenticated: z.boolean(),
  user: userSchema.nullable(),
  csrfToken: z.string(),
  expiresAt: z.string().nullable(),
});
/** loginSchema 校验登录响应；认证令牌不返回脚本。 */
const loginSchema = z.object({
  user: userSchema,
  csrfToken: z.string(),
  expiresAt: z.string(),
});
/** getSession 网络失败不会被伪装为已退出。 */
export async function getSession(signal?: AbortSignal) {
  const session = await request("/auth/session", sessionSchema, { signal });
  setCSRFToken(session.csrfToken);
  return session;
}
/** login 先握手 CSRF，再由服务器设置 Cookie 并轮换会话。 */
export async function login(username: string, password: string) {
  await getSession();
  const result = await request("/auth/login", loginSchema, {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  setCSRFToken(result.csrfToken);
  return result;
}
/** getCurrentUser 兼容原用户读取能力，仍验证 Cookie。 */
export async function getCurrentUser(signal?: AbortSignal) {
  return (await request("/auth/me", z.object({ user: userSchema }), { signal }))
    .user;
}
/** logout 在服务器确认撤销后清理会话；离线时交给界面提示重试。 */
export async function logout() {
  await request("/auth/logout", z.object({ loggedOut: z.boolean() }), {
    method: "POST",
    body: "{}",
  });
  clearAuthToken();
}
