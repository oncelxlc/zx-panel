import * as stylex from "@stylexjs/stylex";

/** 徽标使用语义颜色区分状态，不依赖页面覆写。 */
export const styles = stylex.create({
  root: {
    display: "inline-flex",
    height: 20,
    width: "fit-content",
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    overflow: "hidden",
    borderRadius: 9999,
    border: "1px solid transparent",
    paddingInline: 8,
    paddingBlock: 2,
    fontSize: 12,
    fontWeight: 500,
    whiteSpace: "nowrap",
    transitionProperty: "color, background-color",
    transitionDuration: "var(--motion-fast)",
    outline: { default: "none", ":focus-visible": "3px solid var(--ring)" },
    "--icon-size": "12px",
  },
  success: { backgroundColor: "var(--success-soft)", color: "var(--success)" },
  warning: { backgroundColor: "var(--warning-soft)", color: "var(--warning)" },
  danger: { backgroundColor: "var(--danger-soft)", color: "var(--danger)" },
  default: {
    backgroundColor: "var(--primary)",
    color: "var(--primary-foreground)",
  },
  secondary: {
    backgroundColor: "var(--secondary)",
    color: "var(--secondary-foreground)",
  },
  destructive: {
    backgroundColor: "color-mix(in srgb, var(--destructive) 10%, transparent)",
    color: "var(--danger)",
  },
  outline: {
    borderColor: "var(--border)",
    color: "var(--foreground)",
    backgroundColor: { default: "transparent", ":is(a):hover": "var(--muted)" },
  },
  ghost: {
    backgroundColor: { default: "transparent", ":hover": "var(--muted)" },
    color: { default: "inherit", ":hover": "var(--muted-foreground)" },
  },
  link: {
    color: "var(--primary)",
    textUnderlineOffset: 4,
    textDecoration: { default: "none", ":hover": "underline" },
  },
});
