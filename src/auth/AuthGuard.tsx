import { getCurrentUser, type AuthUser } from "@/auth/api";
import { AuthUserContext } from "@/auth/authContext";
import { AUTH_STATE_EVENT, getAuthToken } from "@/auth/session";
import { Spin } from "antd";
import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router";

export function AuthGuard() {
  const location = useLocation();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(() => Boolean(getAuthToken()));

  useEffect(() => {
    const handleAuthStateChange = () => {
      if (!getAuthToken()) {
        setUser(null);
      }
    };
    window.addEventListener(AUTH_STATE_EVENT, handleAuthStateChange);
    return () => window.removeEventListener(AUTH_STATE_EVENT, handleAuthStateChange);
  }, []);

  useEffect(() => {
    if (!getAuthToken()) {
      return;
    }
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
    return <Spin fullscreen description="正在验证登录状态"/>;
  }
  if (!user) {
    return <Navigate to="/login" replace state={{from: `${location.pathname}${location.search}${location.hash}`}}/>;
  }
  return (
    <AuthUserContext.Provider value={user}>
      <Outlet/>
    </AuthUserContext.Provider>
  );
}
