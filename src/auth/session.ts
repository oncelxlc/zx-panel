const AUTH_TOKEN_KEY = "zx-panel.auth-token";
export const AUTH_STATE_EVENT = "zx-panel:auth-state-changed";

export function getAuthToken() {
  return window.sessionStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string) {
  window.sessionStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken() {
  window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
  window.dispatchEvent(new Event(AUTH_STATE_EVENT));
}
