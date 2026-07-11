/**
 * AUTH_TOKEN_KEY 是登录令牌在 sessionStorage 中的存储键。
 * 关闭浏览器会话后令牌会随 sessionStorage 一同清除。
 */
const AUTH_TOKEN_KEY = "zx-panel.auth-token";

/**
 * AUTH_STATE_EVENT 通知当前页面中的鉴权守卫重新检查会话状态。
 * API 收到 401 或主动退出时都会触发该事件。
 */
export const AUTH_STATE_EVENT = "zx-panel:auth-state-changed";

/**
 * getAuthToken 读取当前浏览器会话保存的认证令牌。
 * 未登录或令牌已清理时返回 null。
 */
export function getAuthToken() {
  return window.sessionStorage.getItem(AUTH_TOKEN_KEY);
}

/**
 * setAuthToken 保存登录接口返回的认证令牌。
 * 令牌只写入 sessionStorage，不进入持久化本地存储。
 */
export function setAuthToken(token: string) {
  window.sessionStorage.setItem(AUTH_TOKEN_KEY, token);
}

/**
 * clearAuthToken 删除本地令牌并广播认证状态变化。
 * 广播使当前页面无需刷新即可跳转回登录页。
 */
export function clearAuthToken() {
  window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
  window.dispatchEvent(new Event(AUTH_STATE_EVENT));
}
