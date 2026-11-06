import * as stylex from "@stylexjs/stylex";

/** 按钮的公共交互状态；图标尺寸通过继承变量传给调用方图标。 */
export const styles = stylex.create({
  root: {
    display: "inline-flex",
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "transparent",
    backgroundClip: "padding-box",
    fontSize: 14,
    fontFamily: "inherit",
    fontWeight: 500,
    whiteSpace: "nowrap",
    userSelect: "none",
    cursor: "pointer",
    color: "inherit",
    transitionProperty: "background-color, color, border-color, box-shadow",
    transitionDuration: {
      default: "var(--motion-fast)",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    outlineWidth: { default: 0, ":focus-visible": 3 },
    outlineStyle: "solid",
    outlineColor: "color-mix(in srgb, var(--ring) 50%, transparent)",
    outlineOffset: 0,
    opacity: { default: 1, ":disabled": 0.5 },
    pointerEvents: { default: "auto", ":disabled": "none" },
    minHeight: { default: 0, "@media (pointer: coarse)": 44 },
    "--icon-size": "16px",
  },
});

/** 保留组件库已有按钮变体，不引入页面专用外观。 */
export const variants = stylex.create({
  default: {
    backgroundColor: {
      default: "var(--primary)",
      ":hover": "color-mix(in srgb, var(--primary) 80%, transparent)",
    },
    color: "var(--primary-foreground)",
  },
  outline: {
    borderColor: "var(--input)",
    backgroundColor: {
      default: "var(--background)",
      ":hover": "var(--muted)",
      ':is([aria-expanded="true"])': "var(--muted)",
    },
    color: "var(--foreground)",
  },
  secondary: {
    backgroundColor: {
      default: "var(--secondary)",
      ":hover": "color-mix(in oklch, var(--secondary), var(--foreground) 5%)",
    },
    color: "var(--secondary-foreground)",
  },
  ghost: {
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--muted)",
      ':is([aria-expanded="true"])': "var(--muted)",
    },
    color: { default: "inherit", ":hover": "var(--foreground)" },
  },
  destructive: {
    backgroundColor: {
      default: "color-mix(in srgb, var(--destructive) 10%, transparent)",
      ":hover": "color-mix(in srgb, var(--destructive) 20%, transparent)",
    },
    color: "var(--danger)",
  },
  link: {
    backgroundColor: "transparent",
    color: "var(--primary)",
    textUnderlineOffset: 4,
    textDecorationLine: { default: "none", ":hover": "underline" },
  },
});

/** 使用原有尺寸名称，触屏命中区域由公共样式保证。 */
export const sizes = stylex.create({
  default: { height: 32, gap: 6, paddingInline: 10 },
  xs: {
    height: 24,
    gap: 4,
    borderRadius: 8,
    paddingInline: 8,
    fontSize: 12,
    "--icon-size": "12px",
  },
  sm: {
    height: 28,
    gap: 4,
    borderRadius: 8,
    paddingInline: 10,
    fontSize: 12.8,
    "--icon-size": "14px",
  },
  lg: { height: 36, gap: 6, paddingInline: 10 },
  icon: { width: 32, height: 32, padding: 0 },
  "icon-xs": { width: 24, height: 24, padding: 0, "--icon-size": "12px" },
  "icon-sm": { width: 28, height: 28, padding: 0, "--icon-size": "14px" },
  "icon-lg": { width: 36, height: 36, padding: 0 },
});
