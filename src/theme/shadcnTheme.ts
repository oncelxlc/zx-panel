import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

export type ThemeMode = "light" | "dark";
export type ThemePreference = ThemeMode | "system";

export const THEME_STORAGE_KEY = "zx-panel-theme";

type ShadcnTokenSet = {
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

export const shadcnTokens: Record<ThemeMode, ShadcnTokenSet> = {
  light: {
    background: "#ffffff",
    foreground: "#252525",
    card: "#ffffff",
    cardForeground: "#252525",
    popover: "#ffffff",
    popoverForeground: "#252525",
    primary: "#343434",
    primaryForeground: "#fafafa",
    secondary: "#f7f7f7",
    secondaryForeground: "#343434",
    muted: "#f7f7f7",
    mutedForeground: "#8e8e8e",
    accent: "#f7f7f7",
    accentForeground: "#343434",
    destructive: "#dc2626",
    border: "#e5e5e5",
    input: "#e5e5e5",
    ring: "#a3a3a3",
    radius: 10,
    success: "#16a34a",
    warning: "#d97706",
  },
  dark: {
    background: "#252525",
    foreground: "#fafafa",
    card: "#343434",
    cardForeground: "#fafafa",
    popover: "#343434",
    popoverForeground: "#fafafa",
    primary: "#e5e5e5",
    primaryForeground: "#343434",
    secondary: "#454545",
    secondaryForeground: "#fafafa",
    muted: "#454545",
    mutedForeground: "#a3a3a3",
    accent: "#454545",
    accentForeground: "#fafafa",
    destructive: "#fb7185",
    border: "rgba(255, 255, 255, 0.1)",
    input: "rgba(255, 255, 255, 0.15)",
    ring: "#8e8e8e",
    radius: 10,
    success: "#22c55e",
    warning: "#f59e0b",
  },
};

function alpha(color: string, opacity: number) {
  if (color.startsWith("#") && color.length === 7) {
    const red = Number.parseInt(color.slice(1, 3), 16);
    const green = Number.parseInt(color.slice(3, 5), 16);
    const blue = Number.parseInt(color.slice(5, 7), 16);

    return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
  }

  if (color.startsWith("rgb(")) {
    return color.replace("rgb(", "rgba(").replace(")", `, ${opacity})`);
  }

  return color;
}

export function createAntdTheme(mode: ThemeMode): ThemeConfig {
  const tokens = shadcnTokens[mode];
  const isDark = mode === "dark";

  return {
    algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    cssVar: {
      key: `zx-panel-${mode}`,
      prefix: "ant",
    },
    hashed: true,
    token: {
      borderRadius: tokens.radius,
      colorBgBase: tokens.background,
      colorBgContainer: tokens.card,
      colorBgElevated: tokens.popover,
      colorBgLayout: tokens.background,
      colorBorder: tokens.border,
      colorBorderSecondary: tokens.input,
      colorError: tokens.destructive,
      colorInfo: tokens.ring,
      colorLink: tokens.primary,
      colorPrimary: tokens.primary,
      colorSuccess: tokens.success,
      colorText: tokens.foreground,
      colorTextBase: tokens.foreground,
      colorTextQuaternary: alpha(tokens.mutedForeground, 0.45),
      colorTextSecondary: alpha(tokens.foreground, isDark ? 0.72 : 0.68),
      colorTextTertiary: tokens.mutedForeground,
      colorWarning: tokens.warning,
      controlHeight: 36,
      fontFamily:
        'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontFamilyCode:
        '"Cascadia Code", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
      fontSize: 14,
      lineType: "solid",
      lineWidth: 1,
      wireframe: false,
    },
    components: {
      Alert: {
        colorInfoBg: alpha(tokens.ring, isDark ? 0.18 : 0.1),
        colorInfoBorder: alpha(tokens.ring, isDark ? 0.36 : 0.24),
      },
      Button: {
        defaultActiveBg: tokens.accent,
        defaultActiveBorderColor: tokens.ring,
        defaultActiveColor: tokens.accentForeground,
        defaultBg: tokens.card,
        defaultBorderColor: tokens.input,
        defaultColor: tokens.cardForeground,
        defaultHoverBg: tokens.accent,
        defaultHoverBorderColor: tokens.ring,
        defaultHoverColor: tokens.accentForeground,
        defaultShadow: "none",
        primaryColor: tokens.primaryForeground,
        primaryShadow: "none",
        textHoverBg: tokens.accent,
      },
      Card: {
        actionsBg: tokens.card,
        extraColor: tokens.mutedForeground,
        headerBg: tokens.card,
      },
      Dropdown: {
        colorBgElevated: tokens.popover,
      },
      Input: {
        activeBg: tokens.card,
        activeBorderColor: tokens.ring,
        activeShadow: `0 0 0 2px ${alpha(tokens.ring, isDark ? 0.32 : 0.22)}`,
        addonBg: tokens.muted,
        hoverBg: tokens.card,
        hoverBorderColor: tokens.ring,
      },
      Layout: {
        colorBgBody: tokens.background,
        colorBgHeader: tokens.card,
        colorBgLayout: tokens.background,
      },
      Menu: {
        itemActiveBg: tokens.accent,
        itemBg: tokens.card,
        itemColor: tokens.cardForeground,
        itemHoverBg: tokens.accent,
        itemHoverColor: tokens.accentForeground,
        itemSelectedBg: alpha(tokens.primary, isDark ? 0.22 : 0.1),
        itemSelectedColor: tokens.foreground,
        popupBg: tokens.popover,
      },
      Modal: {
        contentBg: tokens.popover,
        footerBg: tokens.popover,
        headerBg: tokens.popover,
        titleColor: tokens.popoverForeground,
      },
      Popover: {
        colorBgElevated: tokens.popover,
      },
      Segmented: {
        itemActiveBg: tokens.card,
        itemColor: tokens.mutedForeground,
        itemHoverBg: tokens.accent,
        itemHoverColor: tokens.accentForeground,
        itemSelectedBg: tokens.card,
        itemSelectedColor: tokens.cardForeground,
        trackBg: tokens.muted,
      },
      Select: {
        activeBorderColor: tokens.ring,
        activeOutlineColor: alpha(tokens.ring, isDark ? 0.32 : 0.22),
        clearBg: tokens.card,
        hoverBorderColor: tokens.ring,
        multipleItemBg: tokens.secondary,
        multipleItemBorderColor: tokens.border,
        optionActiveBg: tokens.accent,
        optionSelectedBg: alpha(tokens.primary, isDark ? 0.22 : 0.1),
        optionSelectedColor: tokens.foreground,
        selectorBg: tokens.card,
      },
      Table: {
        borderColor: tokens.border,
        bodySortBg: tokens.muted,
        expandIconBg: tokens.card,
        filterDropdownBg: tokens.popover,
        filterDropdownMenuBg: tokens.popover,
        footerBg: tokens.card,
        footerColor: tokens.cardForeground,
        headerBg: tokens.muted,
        headerColor: tokens.mutedForeground,
        headerFilterHoverBg: tokens.accent,
        headerSortActiveBg: tokens.accent,
        headerSortHoverBg: tokens.accent,
        headerSplitColor: tokens.border,
        rowExpandedBg: tokens.muted,
        rowHoverBg: tokens.accent,
        rowSelectedBg: alpha(tokens.primary, isDark ? 0.22 : 0.1),
        rowSelectedHoverBg: alpha(tokens.primary, isDark ? 0.28 : 0.14),
      },
      Tabs: {
        cardBg: tokens.muted,
        itemActiveColor: tokens.foreground,
        itemHoverColor: tokens.foreground,
        itemSelectedColor: tokens.foreground,
      },
      Tag: {
        defaultBg: tokens.secondary,
        defaultColor: tokens.secondaryForeground,
      },
      Tooltip: {
        colorBgSpotlight: tokens.foreground,
        colorTextLightSolid: tokens.background,
      },
    },
  };
}
