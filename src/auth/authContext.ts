import type { AuthUser } from "@/auth/api";
import { createContext, useContext } from "react";

export const AuthUserContext = createContext<AuthUser | null>(null);

export function useAuthenticatedUser() {
  const user = useContext(AuthUserContext);
  if (!user) {
    throw new Error("useAuthenticatedUser must be used inside AuthGuard");
  }
  return user;
}
