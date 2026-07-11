import type { ThemeContextValue } from "@/types/theme.type";
import { createContext, useContext } from "react";

/**
 * ThemeContext 向组件树提供主题偏好、实际模式和切换操作。
 * 默认空值用于检测组件是否错误地脱离 ThemeProvider 使用。
 */
export const ThemeContext: React.Context<ThemeContextValue | null> = createContext<ThemeContextValue | null>(null);

/**
 * useThemeMode 读取主题上下文并返回类型安全的主题操作。
 * 在 ThemeProvider 外调用时抛出明确错误，避免静默使用无效状态。
 */
export function useThemeMode(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useThemeMode must be used within ThemeProvider");
  }

  return context;
}
