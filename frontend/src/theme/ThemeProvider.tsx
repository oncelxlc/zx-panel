import { THEME_STORAGE_KEY, THEME_STYLE_STORAGE_KEY } from "@/theme/constants";
import {
  getSystemTheme,
  isDarkThemePath,
  isSystemThemePath,
  syncDocumentTheme,
} from "@/theme/systemTheme";
import type {
  ThemeContextValue,
  ThemeMode,
  ThemePreference,
  ThemeProviderProps,
  ThemeStyle,
} from "@/types/theme.type";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router";
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
 * getStoredPreference 从本地存储读取并校验主题偏好。
 * 缺失、非法或无窗口环境时统一回退到跟随系统。
 */
function getStoredPreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }

  try {
    const storedPreference = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(storedPreference) ? storedPreference : "system";
  } catch {
    // 浏览器禁用存储时继续跟随系统，避免主题偏好阻止登录页渲染。
    return "system";
  }
}

/** 读取外壳风格；旧用户、无窗口或存储不可用时保留默认布局。 */
function getStoredStyle(): ThemeStyle {
  if (typeof window === "undefined") return "default";
  try {
    return window.localStorage.getItem(THEME_STYLE_STORAGE_KEY) === "islands"
      ? "islands"
      : "default";
  } catch {
    return "default";
  }
}

/**
 * ThemeProvider 在路由内管理主题；登录页固定深色，初始化页跟随系统，后台使用已保存偏好。
 * 系统变化与站内导航统一同步根节点主题，并清理尚未完成的切换动画。
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const { pathname } = useLocation();
  const [preference, setPreferenceState] =
    useState<ThemePreference>(getStoredPreference);
  const [systemMode, setSystemMode] = useState<ThemeMode>(getSystemTheme);
  const [themeStyle, setThemeStyleState] = useState<ThemeStyle>(getStoredStyle);

  const resolvedMode = isDarkThemePath(pathname)
    ? "dark"
    : isSystemThemePath(pathname) || preference === "system"
      ? systemMode
      : preference;

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference);

    if (typeof window === "undefined") {
      return;
    }

    // 浏览器环境持久化用户选择，后续访问可直接恢复。
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
    } catch {
      // 存储不可用时仍允许后台在当前会话中切换主题。
    }
  }, []);

  /** 风格只保存到浏览器；写入失败仍允许在当前会话切换。 */
  const setThemeStyle = useCallback((nextStyle: ThemeStyle) => {
    setThemeStyleState(nextStyle);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(THEME_STYLE_STORAGE_KEY, nextStyle);
    } catch {
      // 隐私模式等存储限制不阻断外观设置。
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setPreference(resolvedMode === "dark" ? "light" : "dark");
  }, [resolvedMode, setPreference]);

  useEffect(() => syncDocumentTheme(resolvedMode), [resolvedMode]);

  useEffect(() => {
    document.documentElement.dataset.themeStyle =
      isDarkThemePath(pathname) || isSystemThemePath(pathname)
        ? "default"
        : themeStyle;
  }, [pathname, themeStyle]);

  useEffect(() => {
    /** 同步其他标签页的偏好；移除或无效值恢复跟随系统。 */
    function syncPreference(event: StorageEvent) {
      if (event.key === THEME_STORAGE_KEY || event.key === null) {
        setPreferenceState(getStoredPreference());
      }
      if (event.key === THEME_STYLE_STORAGE_KEY || event.key === null) {
        setThemeStyleState(getStoredStyle());
      }
    }
    window.addEventListener("storage", syncPreference);
    return () => window.removeEventListener("storage", syncPreference);
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    // 仅明确的亮色偏好启用亮色，与首屏脚本及无偏好时的暗色回退一致。
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const handleChange = () => {
      setSystemMode(query.matches ? "light" : "dark");
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
      themeStyle,
      setPreference,
      setThemeStyle,
      toggleTheme,
    }),
    [
      preference,
      resolvedMode,
      themeStyle,
      setPreference,
      setThemeStyle,
      toggleTheme,
    ],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
