/**
 * 主题模式类型
 */
export type ThemeMode = "light" | "dark";

/**
 * 主题偏好类型，允许用户选择 "light"、"dark" 或 "system" 模式
 */
export type ThemePreference = ThemeMode | "system";

/**
 * Shadcn 主题的一组设计标记，包括颜色和其他样式属性。
 */
export type ShadcnTokenSet = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  border: string;
  input: string;
  ring: string;
  radius: number;
  success: string;
  warning: string;
};

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
 * children 会在 Ant Design 与自定义主题上下文内渲染。
 */
export type ThemeProviderProps = {
  children: ReactNode;
};
import type { ReactNode } from "react";
