import * as stylex from "@stylexjs/stylex";

/** Lucide 图标从所在组件继承尺寸，页面可通过 StyleX 合并明确覆盖。 */
export const iconStyles = stylex.create({
  root: {
    width: "var(--icon-size, 16px)",
    height: "var(--icon-size, 16px)",
    flexShrink: 0,
    pointerEvents: "none",
  },
});
