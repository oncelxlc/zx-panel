import type { AuthUser } from "@/types/auth.type";
import { createContext, useContext } from "react";

/**
 * AuthUserContext 向受保护页面提供已通过服务端校验的用户。
 * 默认值为空，只有 AuthGuard 校验成功后才会注入用户。
 */
export const AuthUserContext = createContext<AuthUser | null>(null);

/**
 * useAuthenticatedUser 读取鉴权守卫提供的当前用户。
 * 在守卫外调用属于编程错误，会直接抛出明确异常。
 */
export function useAuthenticatedUser() {
  const user = useContext(AuthUserContext);
  if (!user) {
    throw new Error("useAuthenticatedUser must be used inside AuthGuard");
  }
  return user;
}
