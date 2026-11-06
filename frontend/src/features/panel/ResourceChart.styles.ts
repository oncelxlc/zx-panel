import * as stylex from "@stylexjs/stylex";

/** ResourceChart 的布局和响应式样式；交互控件继续使用组件库默认外观。 */
export const styles = stylex.create({
  stack: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  hidden: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  },
  chartContainer: {
    height: 240,
    width: "100%",
  },
  footer: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  caption: {
    fontSize: 12,
    lineHeight: "16px",
    color: "var(--muted-foreground)",
  },
  tableScroll: {
    maxHeight: 256,
    overflow: "auto",
  },
});
