import { THEME_STORAGE_KEY } from "@/theme/constants";
import type {
  ThemeContextValue,
  ThemeMode,
  ThemePreference,
  ThemeProviderProps,
} from "@/types/theme.type";
import {
  App as AntdApp,
  ConfigProvider,
  type ThemeConfig,
} from "antd";
import zhCN from "antd/locale/zh_CN";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createAntdTheme, shadcnTokens } from "./shadcnTheme";
import { ThemeContext } from "./themeContext";

/**
 * isThemeMode 判断存储值是否是可直接应用的亮暗主题模式。
 * 类型谓词帮助后续逻辑收窄到 ThemeMode。
 */
function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark";
}

/**
 * isThemePreference 判断存储值是否是受支持的主题偏好。
 * 除亮暗模式外还允许跟随系统的 system 值。
 */
function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || isThemeMode(value);
}

/**
 * getSystemTheme 根据浏览器媒体查询解析当前系统主题。
 * SSR 或无窗口环境统一回退到亮色模式。
 */
function getSystemTheme(): ThemeMode {
  if (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }

  return "light";
}

/**
 * getStoredPreference 从本地存储读取并校验主题偏好。
 * 缺失、非法或无窗口环境时统一回退到跟随系统。
 */
function getStoredPreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }

  const storedPreference = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemePreference(storedPreference) ? storedPreference : "system";
}

/**
 * syncDocumentTheme 将实际主题模式同步到根元素和全局 CSS 变量。
 * 无 document 的渲染环境会跳过所有 DOM 操作。
 */
function syncDocumentTheme(mode: ThemeMode) {
  if (typeof document === "undefined") {
    return;
  }

  const tokens = shadcnTokens[mode];
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.classList.toggle("dark", mode === "dark");
  root.style.setProperty("--selection-background", tokens.primary);
  root.style.setProperty("--selection-foreground", tokens.primaryForeground);
}

/**
 * ThemeProvider 管理用户主题偏好并配置 Ant Design 主题上下文。
 * 组件同时监听系统主题变化并把最终模式同步到文档根节点。
 */
export function ThemeProvider({children}: ThemeProviderProps) {
  const [preference, setPreferenceState] =
    useState<ThemePreference>(getStoredPreference);
  const [systemMode, setSystemMode] = useState<ThemeMode>(getSystemTheme);

  const resolvedMode = preference === "system" ? systemMode : preference;
  const antdTheme = useMemo<ThemeConfig>(
    () => createAntdTheme(resolvedMode),
    [resolvedMode],
  );

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference);

    if (typeof window === "undefined") {
      return;
    }

    // 浏览器环境持久化用户选择，后续访问可直接恢复。
    window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
  }, []);

  const toggleTheme = useCallback(() => {
    setPreference(resolvedMode === "dark" ? "light" : "dark");
  }, [resolvedMode, setPreference]);

  useEffect(() => {
    syncDocumentTheme(resolvedMode);
  }, [resolvedMode]);

  useEffect(() => {
    // 系统模式变化时只更新 system 偏好依赖的实际模式。
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      setSystemMode(query.matches ? "dark" : "light");
    };

    handleChange();
    query.addEventListener("change", handleChange);

    return () => {
      query.removeEventListener("change", handleChange);
    };
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      resolvedMode,
      setPreference,
      toggleTheme,
    }),
    [preference, resolvedMode, setPreference, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider theme={antdTheme} locale={zhCN}>
        <AntdApp>{children}</AntdApp>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}
