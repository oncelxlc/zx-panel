/**
 * 主题模式类型
 */
export type ThemeMode = "light" | "dark";

/**
 * 主题偏好类型，允许用户选择 "light"、"dark" 或 "system" 模式
 */
export type ThemePreference = ThemeMode | "system";

/**
 * 用于在本地存储中保存用户主题偏好的键
 * @type {string}
 */
export const THEME_STORAGE_KEY = "zx-panel-theme";

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
