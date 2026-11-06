import * as stylex from "@stylexjs/stylex";

/** Apps 的布局和响应式样式；交互控件继续使用组件库默认外观。 */
export const styles = stylex.create({
  detailValue: { margin: 0, overflowWrap: "anywhere" },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  pageStack: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    minWidth: 0,
  },
  rowActions: {
    display: "flex",
    gap: 4,
  },
  stack: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  filters: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
  },
  inputGroup: {
    maxWidth: 384,
  },
  sheetContent: {
    width: "100%",
    maxWidth: {
      default: null,
      "@media (min-width: 640px)": 640,
    },
  },
  sheetBody: {
    minHeight: 0,
    flex: 1,
    overflow: "auto",
    paddingInline: 16,
    paddingBottom: 16,
  },
  actions: {
    display: "flex",
    gap: 8,
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
