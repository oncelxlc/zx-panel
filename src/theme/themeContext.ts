import { ThemeMode, ThemePreference } from "@/types/theme.type";
import { createContext, useContext } from "react";

export type ThemeContextValue = {
  preference: ThemePreference;
  resolvedMode: ThemeMode;
  setPreference: (preference: ThemePreference) => void;
  toggleTheme: () => void;
};

/**
 * 上下文提供与主题相关的值和功能
 * @type {React.Context<ThemeContextValue | null>}
 */
export const ThemeContext: React.Context<ThemeContextValue | null> = createContext<ThemeContextValue | null>(null);

/**
 * 用于访问主题上下文的自定义Hook
 * @returns {ThemeContextValue}
 */
export function useThemeMode(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useThemeMode must be used within ThemeProvider");
  }

  return context;
}
