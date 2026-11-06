import * as stylex from "@stylexjs/stylex";

/** OperationSheet 的布局和响应式样式；交互控件继续使用组件库默认外观。 */
export const styles = stylex.create({
  detailValue: { margin: 0, overflowWrap: "anywhere" },
  sheetContent: {
    width: "100%",
    maxWidth: {
      default: null,
      "@media (min-width: 640px)": 560,
    },
  },
  body: {
    display: "flex",
    minHeight: 0,
    flex: 1,
    flexDirection: "column",
    gap: 16,
    overflow: "auto",
    paddingInline: 16,
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(90px, auto) minmax(0, 1fr)",
    columnGap: 16,
    rowGap: 12,
    fontSize: 14,
    lineHeight: "20px",
  },
  detailRow: {
    display: "contents",
  },
  detailLabel: {
    color: "var(--muted-foreground)",
  },
  detailText: {
    wordBreak: "break-all",
  },
});
