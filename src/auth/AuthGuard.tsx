import { getCurrentUser } from "@/auth/api";
import { AuthUserContext } from "@/auth/authContext";
import { AUTH_STATE_EVENT, getAuthToken } from "@/auth/session";
import type { AuthUser } from "@/types/auth.type";
import { Spinner } from "@/components/ui/spinner";
import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router";

/**
 * AuthGuard 在渲染受保护路由前向后端验证当前会话。
 * 无令牌、会话失效或全局收到 401 时统一跳转登录页。
 */
export function AuthGuard() {
  const location = useLocation();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(() => Boolean(getAuthToken()));

  useEffect(() => {
    // 监听 API 客户端广播，在当前页面即时响应会话失效。
    const handleAuthStateChange = () => {
      if (!getAuthToken()) {
        setUser(null);
      }
    };
    window.addEventListener(AUTH_STATE_EVENT, handleAuthStateChange);
    return () =>
      window.removeEventListener(AUTH_STATE_EVENT, handleAuthStateChange);
  }, []);

  useEffect(() => {
    if (!getAuthToken()) {
      return;
    }
    // 组件卸载时取消校验，避免过期异步结果更新新页面状态。
    const controller = new AbortController();
    let active = true;
    getCurrentUser(controller.signal)
      .then((currentUser) => {
        if (active) setUser(currentUser);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  if (checking) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <Item variant="outline" role="status">
          <ItemMedia>
            <Spinner aria-hidden="true" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>正在验证登录状态</ItemTitle>
          </ItemContent>
        </Item>
      </div>
    );
  }
  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: `${location.pathname}${location.search}${location.hash}`,
        }}
      />
    );
  }
  return (
    <AuthUserContext.Provider value={user}>
      <Outlet />
    </AuthUserContext.Provider>
  );
}
