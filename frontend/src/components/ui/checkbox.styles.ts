import * as stylex from "@stylexjs/stylex";

/** 复选框状态由 Base UI 管理，外扩命中区不改变布局尺寸。 */
export const styles = stylex.create({
  root: {
    position: "relative",
    display: "flex",
    width: 16,
    height: 16,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: {
      default: "var(--input)",
      ":is([data-checked])": "var(--primary)",
      ':is([aria-invalid="true"])': "var(--danger)",
    },
    backgroundColor: {
      default: "transparent",
      ":is([data-checked])": "var(--primary)",
    },
    color: "var(--primary-foreground)",
    outlineStyle: "solid",
    outlineColor: "color-mix(in srgb, var(--ring) 50%, transparent)",
    outlineWidth: { default: 0, ":focus-visible": 3 },
    cursor: { default: "pointer", ":disabled": "not-allowed" },
    opacity: { default: 1, ":disabled": 0.5 },
    transitionProperty: "background-color, border-color",
    transitionDuration: "var(--motion-fast)",
    "::after": {
      content: '""',
      position: "absolute",
      insetInline: -12,
      insetBlock: -8,
    },
  },
  indicator: {
    display: "grid",
    placeContent: "center",
    color: "currentColor",
    "--icon-size": "14px",
  },
});
