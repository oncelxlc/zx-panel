import * as stylex from "@stylexjs/stylex";

/** 输入框保留组件库的尺寸、边界、焦点和禁用状态，颜色来自共享主题。 */
export const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    width: "100%",
    minWidth: 0,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: {
      default: "var(--input)",
      ":focus-visible": "var(--ring)",
      ':is([aria-invalid="true"])': "var(--danger)",
    },
    backgroundColor: {
      default: "transparent",
      ":is(.dark *)": "color-mix(in srgb, var(--input) 30%, transparent)",
      ":disabled": "color-mix(in srgb, var(--input) 50%, transparent)",
    },
    color: "inherit",
    fontFamily: "inherit",
    fontSize: { default: 14, "@media (max-width: 767px)": 16 },
    paddingInline: 10,
    paddingBlock: 4,
    outlineWidth: { default: 0, ":focus-visible": 3 },
    outlineStyle: "solid",
    outlineColor: "color-mix(in srgb, var(--ring) 50%, transparent)",
    outlineOffset: 0,
    opacity: { default: 1, ":disabled": 0.5 },
    cursor: { default: "text", ":disabled": "not-allowed" },
    minHeight: { default: 0, "@media (pointer: coarse)": 44 },
    transitionProperty: "background-color, border-color, outline-color",
    transitionDuration: {
      default: "var(--motion-fast)",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    "::placeholder": { color: "var(--muted-foreground)" },
    "::file-selector-button": {
      height: 24,
      borderWidth: 0,
      backgroundColor: "transparent",
      color: "inherit",
      fontSize: 14,
      fontWeight: 500,
    },
  },
});
