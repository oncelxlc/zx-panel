/**
 * ThemeMode 表示文档实际应用的明暗主题，不包含系统偏好。
 */
export type ThemeMode = "light" | "dark";

/**
 * 主题偏好类型，允许用户选择 "light"、"dark" 或 "system" 模式
 */
export type ThemePreference = ThemeMode | "system";

/**
 * ThemeContextValue 描述主题上下文对组件暴露的状态和操作。
 * preference 保留用户选择，resolvedMode 表示实际生效模式。
 */
export type ThemeContextValue = {
  preference: ThemePreference;
  resolvedMode: ThemeMode;
  setPreference: (preference: ThemePreference) => void;
  toggleTheme: () => void;
};

/**
 * ThemeProviderProps 描述主题提供器包裹的 React 内容。
 * children 继承同一份主题偏好，不依赖具体组件库。
 */
export type ThemeProviderProps = {
  children: ReactNode;
};
import type { ReactNode } from "react";
