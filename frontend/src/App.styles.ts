import * as stylex from "@stylexjs/stylex";

/** App 的布局和响应式样式；交互控件继续使用组件库默认外观。 */
export const styles = stylex.create({
  shell: {
    display: "grid",
    minHeight: "100svh",
    gridTemplateColumns: {
      default: "minmax(280px, 360px) minmax(0, 1fr)",
      "@media (max-width: 900px)": "minmax(0, 1fr)",
    },
    alignItems: "start",
    gap: 24,
    padding: 24,
  },
  cardFooter: {
    flexWrap: "wrap",
    gap: 8,
  },
  cardContent: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
});
