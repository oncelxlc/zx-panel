/** AUTH_STATE_EVENT 通知页面会话撤销并释放敏感缓存。 */
export const AUTH_STATE_EVENT = "zx-panel:auth-state-changed";
/** csrfToken 只在当前页面内存保留；认证由 HttpOnly Cookie 管理。 */
let csrfToken = "";
/** getCSRFToken 返回最近握手的 CSRF 值。 */
export function getCSRFToken() {
  return csrfToken;
}
/** setCSRFToken 在会话轮换后更新内存值。 */
export function setCSRFToken(value: string) {
  csrfToken = value;
}
/** clearAuthToken 清理遗留 Bearer 数据并通知订阅者。 */
export function clearAuthToken() {
  csrfToken = "";
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem("zx-panel.auth-token");
  } catch {
    /* 禁用存储不影响 Cookie 注销。 */
  }
  window.dispatchEvent(new Event(AUTH_STATE_EVENT));
}
