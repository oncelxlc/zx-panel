import * as stylex from "@stylexjs/stylex";

/** 开关按钮与按钮组共享尺寸、焦点和按下状态。 */
export const styles = stylex.create({
  root: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: "var(--radius-lg)",
    fontSize: 14,
    fontWeight: 500,
    whiteSpace: "nowrap",
    transitionProperty: "color, background-color",
    transitionDuration: "var(--motion-fast)",
    outline: { default: "none", ":focus-visible": "3px solid var(--ring)" },
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--muted)",
      ':is([aria-pressed="true"], [data-state="on"])': "var(--muted)",
    },
    color: "var(--foreground)",
    cursor: "pointer",
    pointerEvents: { default: null, ":disabled": "none" },
    opacity: { default: 1, ":disabled": 0.5 },
    minHeight: { default: null, "@media (pointer: coarse)": 44 },
    "--icon-size": "16px",
  },
  default: { height: 32, minWidth: 32, paddingInline: 10 },
  sm: {
    height: 28,
    minWidth: 28,
    paddingInline: 10,
    fontSize: 13,
    borderRadius: "var(--radius-md)",
    "--icon-size": "14px",
  },
  lg: { height: 36, minWidth: 36, paddingInline: 10 },
  outline: { border: "1px solid var(--input)" },
});
