import * as stylex from "@stylexjs/stylex";

/** 开关通过 Base UI 的选中属性驱动轨道和滑块，不另建交互状态。 */
export const styles = stylex.create({
  root: {
    position: "relative",
    display: "inline-flex",
    flexShrink: 0,
    alignItems: "center",
    borderRadius: 9999,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "transparent",
    width: { default: 32, ':is([data-size="sm"])': 24 },
    height: { default: 18.4, ':is([data-size="sm"])': 14 },
    backgroundColor: {
      default: "var(--input)",
      ":is([data-checked])": "var(--primary)",
    },
    outlineWidth: { default: 0, ":focus-visible": 3 },
    outlineStyle: "solid",
    outlineColor: "color-mix(in srgb, var(--ring) 50%, transparent)",
    opacity: { default: 1, ":is([data-disabled])": 0.5 },
    cursor: { default: "pointer", ":is([data-disabled])": "not-allowed" },
    transitionProperty: "background-color",
    transitionDuration: "var(--motion-fast)",
    "::after": {
      content: '""',
      position: "absolute",
      insetInline: -12,
      insetBlock: -8,
    },
  },
  thumb: {
    pointerEvents: "none",
    display: "block",
    borderRadius: 9999,
    backgroundColor: "var(--background)",
    width: { default: 16, ':is([data-size="sm"] *)': 12 },
    height: { default: 16, ':is([data-size="sm"] *)': 12 },
    transform: {
      default: "translateX(0)",
      ":is([data-checked])": "translateX(calc(100% - 2px))",
    },
    transitionProperty: "transform",
    transitionDuration: {
      default: "var(--motion-fast)",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
  },
});
