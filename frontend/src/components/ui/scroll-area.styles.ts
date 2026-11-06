import * as stylex from "@stylexjs/stylex";

/** 滚动容器保留 Base UI 的滚动定位和键盘焦点反馈。 */
export const styles = stylex.create({
  root: { position: "relative" },
  viewport: {
    width: "100%",
    height: "100%",
    borderRadius: "inherit",
    outlineWidth: { default: 0, ":focus-visible": 3 },
    outlineStyle: "solid",
    outlineColor: "color-mix(in srgb, var(--ring) 50%, transparent)",
  },
  bar: {
    display: "flex",
    touchAction: "none",
    padding: 1,
    userSelect: "none",
    transitionProperty: "background-color",
    transitionDuration: "var(--motion-fast)",
  },
  horizontal: {
    height: 10,
    flexDirection: "column",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "transparent",
  },
  vertical: {
    width: 10,
    height: "100%",
    borderLeftWidth: 1,
    borderLeftStyle: "solid",
    borderLeftColor: "transparent",
  },
  thumb: {
    position: "relative",
    flex: 1,
    borderRadius: 9999,
    backgroundColor: "var(--border)",
  },
});
