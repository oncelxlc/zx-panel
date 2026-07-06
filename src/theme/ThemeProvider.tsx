import {
  App as AntdApp,
  ConfigProvider,
  type ThemeConfig,
} from "antd";
import zhCN from "antd/locale/zh_CN";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  createAntdTheme,
  THEME_STORAGE_KEY,
  type ThemeMode,
  type ThemePreference,
} from "./shadcnTheme";
import { ThemeContext, type ThemeContextValue } from "./themeContext";

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark";
}

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || isThemeMode(value);
}

function getSystemTheme(): ThemeMode {
  if (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }

  return "light";
}

function getStoredPreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }

  const storedPreference = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemePreference(storedPreference) ? storedPreference : "system";
}

function syncDocumentTheme(mode: ThemeMode) {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  root.dataset.theme = mode;
  root.classList.toggle("dark", mode === "dark");
}

type ThemeProviderProps = {
  children: ReactNode;
};

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

    window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
  }, []);

  const toggleTheme = useCallback(() => {
    setPreference(resolvedMode === "dark" ? "light" : "dark");
  }, [resolvedMode, setPreference]);

  useEffect(() => {
    syncDocumentTheme(resolvedMode);
  }, [resolvedMode]);

  useEffect(() => {
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
