import * as stylex from "@stylexjs/stylex";

/** Settings 的布局和响应式样式；交互控件继续使用组件库默认外观。 */
export const styles = stylex.create({
  detailValue: { margin: 0, overflowWrap: "anywhere" },
  pageStack: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    minWidth: 0,
    maxWidth: 896,
  },
  appearanceActions: {
    marginTop: 20,
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(90px, auto) minmax(0, 1fr)",
    columnGap: 16,
    rowGap: 12,
    fontSize: 14,
    lineHeight: "20px",
  },
});
