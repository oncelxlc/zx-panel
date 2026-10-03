import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { AuthUserContext } from "@/auth/authContext";
import { AUTH_STATE_EVENT } from "@/auth/session";
import { queryClient, sessionQuery } from "@/features/panel/queries";
import { QueryState } from "@/features/panel/Shared";
import { Spinner } from "@/components/ui/spinner";

/** AuthGuard 以服务器 Cookie 会话为事实，失效时释放敏感查询。 */
export function AuthGuard() {
  const location = useLocation();
  const session = useQuery(sessionQuery);
  const [revoked, setRevoked] = useState(false);
  useEffect(() => {
    /** 会话失效让所有敏感视图卸载，不继续展示缓存主机数据。 */
    function clearSession() {
      // 清除 QueryClient 会移除原查询实例；守卫必须同时更新自身状态，立即卸载敏感视图。
      setRevoked(true);
      queryClient.clear();
      queryClient.setQueryData(["session"], {
        authenticated: false,
        user: null,
        csrfToken: "",
        expiresAt: null,
      });
    }
    window.addEventListener(AUTH_STATE_EVENT, clearSession);
    return () => window.removeEventListener(AUTH_STATE_EVENT, clearSession);
  }, []);
  if (revoked)
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search + location.hash }}
      />
    );
  if (session.isPending)
    return (
      <div
        className="flex min-h-svh items-center justify-center gap-3"
        role="status"
      >
        <Spinner aria-hidden="true" />
        正在验证会话…
      </div>
    );
  if (session.isError)
    return (
      <div className="m-auto max-w-lg p-6">
        <QueryState error={session.error} retry={() => void session.refetch()} />
      </div>
    );
  if (!session.data.authenticated || !session.data.user)
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search + location.hash }}
      />
    );
  return (
    <AuthUserContext.Provider value={session.data.user}>
      <Outlet />
    </AuthUserContext.Provider>
  );
}
