import { ShadcnTokenSet, ThemeMode } from "@/types/theme.type";
import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

export const shadcnTokens: Record<ThemeMode, ShadcnTokenSet> = {
  light: {
    background: "#FFFFFF",
    foreground: "#0A0A0A",
    card: "#FFFFFF",
    cardForeground: "#0A0A0A",
    popover: "#FFFFFF",
    popoverForeground: "#252525",
    primary: "#171717",
    primaryForeground: "#FAFAFA",
    secondary: "#F5F5F5",
    secondaryForeground: "#171717",
    muted: "#F7F7F7",
    mutedForeground: "#737373",
    accent: "#F5F5F5",
    accentForeground: "#171717",
    destructive: "#E7000B",
    border: "#E5E5E5",
    input: "#E5E5E5",
    ring: "#A1A1A1",
    radius: 10,
    success: "#009689",
    warning: "#FE9A00",
  },
  dark: {
    background: "#0A0A0A",
    foreground: "#FAFAFA",
    card: "#171717",
    cardForeground: "#FAFAFA",
    popover: "#171717",
    popoverForeground: "#FAFAFA",
    primary: "#E5E5E5",
    primaryForeground: "#171717",
    secondary: "#262626",
    secondaryForeground: "#FAFAFA",
    muted: "#262626",
    mutedForeground: "#A1A1A1",
    accent: "#262626",
    accentForeground: "#FAFAFA",
    destructive: "#FF6467",
    border: "#FFFFFF1A",
    input: "#FFFFFF26",
    ring: "#737373",
    radius: 10,
    success: "#00BC7D",
    warning: "#FE9A00",
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
        "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
      fontFamilyCode:
        "\"Cascadia Code\", \"SFMono-Regular\", Consolas, \"Liberation Mono\", monospace",
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
