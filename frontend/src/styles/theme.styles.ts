import * as stylex from "@stylexjs/stylex";

/** 主题令牌在根节点统一定义；首屏脚本和运行时继续用 dark 标记同步主题。 */
export const styles = stylex.create({
  root: {
    "::view-transition-group(root)": {
      animationDuration: "150ms",
      animationTimingFunction: "ease-in-out",
    },
    "::view-transition": { pointerEvents: "none" },
    colorScheme: {
      default: "light",
      ":is(.dark)": "dark",
    },
    fontFamily: "var(--font-sans)",
    lineHeight: 1.5,
    scrollbarWidth: "thin",
    overscrollBehaviorX: "contain",
    scrollbarColor: {
      default: "var(--border) transparent",
      ":hover": "var(--muted-foreground) transparent",
    },
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
    minHeight: "100%",
    fontSynthesis: "none",
    textRendering: "optimizeLegibility",
    "--font-sans":
      'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    "--font-heading": "var(--font-sans)",
    "--font-mono":
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    "--motion-fast": {
      default: "100ms",
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    "--motion-content": {
      default: "160ms",
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    "--motion-panel": {
      default: "200ms",
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    "--motion-exit": {
      default: "140ms",
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    "--motion-ease": "cubic-bezier(0.2, 0.8, 0.2, 1)",
    "--shadow-glass": {
      default: "0 16px 48px -16px rgb(0 0 0 / 20%)",
      ":is(.dark)":
        "0 32px 72px -16px rgb(0 0 0 / 85%), 0 12px 24px -8px rgb(0 0 0 / 55%)",
    },
    "--shadow-island": {
      default: "0 0 0 1px var(--border), 0 2px 8px rgb(0 0 0 / 3%)",
      ":is(.dark)": "0 0 0 1px var(--border), 0 2px 8px rgb(0 0 0 / 16%)",
    },
    "--radius-sm": "0.375rem",
    "--radius-md": "0.5rem",
    "--radius-lg": "0.75rem",
    "--radius-xl": "1rem",
    "--radius-2xl": "1.35rem",
    "--radius-3xl": "1.65rem",
    "--radius-4xl": "1.95rem",
    "::selection": {
      color: "var(--primary-foreground)",
      backgroundColor: "var(--primary)",
    },
    "--background": {
      default: "#f7f8fa",
      ":is(.dark)": "#08090b",
    },
    "--foreground": {
      default: "#17191d",
      ":is(.dark)": "#f3f4f6",
    },
    "--card": {
      default: "#ffffff",
      ":is(.dark)": "#101114",
    },
    "--card-foreground": {
      default: "#17191d",
      ":is(.dark)": "#f3f4f6",
    },
    "--popover": {
      default: "#ffffff",
      ":is(.dark)": "#17191d",
    },
    "--popover-foreground": {
      default: "#17191d",
      ":is(.dark)": "#f3f4f6",
    },
    "--primary": {
      default: "#17191d",
      ":is(.dark)": "#f3f4f6",
    },
    "--primary-foreground": {
      default: "#ffffff",
      ":is(.dark)": "#101114",
    },
    "--secondary": {
      default: "#f1f3f5",
      ":is(.dark)": "#1a1c20",
    },
    "--secondary-foreground": {
      default: "#17191d",
      ":is(.dark)": "#f3f4f6",
    },
    "--muted": {
      default: "#f1f3f5",
      ":is(.dark)": "#1a1c20",
    },
    "--muted-foreground": {
      default: "#5d6572",
      ":is(.dark)": "#a1a7b0",
    },
    "--accent": {
      default: "#edf1f6",
      ":is(.dark)": "#22262c",
    },
    "--accent-foreground": {
      default: "#17191d",
      ":is(.dark)": "#f3f4f6",
    },
    "--border": {
      default: "#e2e5ea",
      ":is(.dark)": "#292d33",
    },
    "--input": {
      default: "#7a8390",
      ":is(.dark)": "#737d8a",
    },
    "--signal": {
      default: "#1d4ed8",
      ":is(.dark)": "#67e8f9",
    },
    "--signal-soft": {
      default: "#eff6ff",
      ":is(.dark)": "#102c32",
    },
    "--ring": {
      default: "#1d4ed8",
      ":is(.dark)": "#67e8f9",
    },
    "--success": {
      default: "#166534",
      ":is(.dark)": "#86efac",
    },
    "--success-soft": {
      default: "#f0fdf4",
      ":is(.dark)": "#11281b",
    },
    "--warning": {
      default: "#854d0e",
      ":is(.dark)": "#fde047",
    },
    "--warning-soft": {
      default: "#fffbeb",
      ":is(.dark)": "#30270c",
    },
    "--danger": {
      default: "#b91c1c",
      ":is(.dark)": "#fca5a5",
    },
    "--danger-soft": {
      default: "#fef2f2",
      ":is(.dark)": "#32181c",
    },
    "--destructive": {
      default: "#b91c1c",
      ":is(.dark)": "#991b1b",
    },
    "--destructive-foreground": "#ffffff",
    "--chart-1": {
      default: "#1d4ed8",
      ":is(.dark)": "#67e8f9",
    },
    "--chart-2": {
      default: "#0e7490",
      ":is(.dark)": "#93c5fd",
    },
    "--chart-3": {
      default: "#6d28d9",
      ":is(.dark)": "#c4b5fd",
    },
    "--chart-4": {
      default: "#4b5563",
      ":is(.dark)": "#a1a7b0",
    },
    "--chart-5": {
      default: "#854d0e",
      ":is(.dark)": "#fde047",
    },
    "--sidebar": {
      default: "#ffffff",
      ":is(.dark)": "#0b0c0f",
    },
    "--sidebar-foreground": {
      default: "#17191d",
      ":is(.dark)": "#f3f4f6",
    },
    "--sidebar-primary": {
      default: "#17191d",
      ":is(.dark)": "#f3f4f6",
    },
    "--sidebar-primary-foreground": {
      default: "#ffffff",
      ":is(.dark)": "#101114",
    },
    "--sidebar-accent": {
      default: "#edf1f6",
      ":is(.dark)": "#1a1c20",
    },
    "--sidebar-accent-foreground": {
      default: "#17191d",
      ":is(.dark)": "#f3f4f6",
    },
    "--sidebar-border": {
      default: "#e2e5ea",
      ":is(.dark)": "#292d33",
    },
    "--sidebar-ring": {
      default: "#1d4ed8",
      ":is(.dark)": "#67e8f9",
    },
    "--radius": "0.75rem",
  },
  body: {
    margin: 0,
    minHeight: "100%",
    color: "var(--foreground)",
    backgroundColor: "var(--background)",
  },
  app: {
    minHeight: "100%",
  },
});
