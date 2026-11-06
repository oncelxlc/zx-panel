import * as stylex from "@stylexjs/stylex";

/** Overview 的布局和响应式样式；交互控件继续使用组件库默认外观。 */
export const styles = stylex.create({
  detailValue: { margin: 0, overflowWrap: "anywhere" },
  pageStack: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    minWidth: 0,
  },
  status: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  caption: {
    fontSize: 12,
    lineHeight: "16px",
    color: "var(--muted-foreground)",
  },
  metricGrid: {
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(4, minmax(0, 1fr))",
      "@media (max-width: 1023px)": "repeat(2, minmax(0, 1fr))",
      "@media (max-width: 399px)": "minmax(0, 1fr)",
    },
    gap: 16,
  },
  overviewGrid: {
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 2fr) minmax(300px, 1fr)",
      "@media (max-width: 1023px)": "minmax(0, 1fr)",
    },
    gap: 16,
    alignItems: "start",
  },
  cardContent: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  labelRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  serverIcon: {
    width: 16,
    height: 16,
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(90px, auto) minmax(0, 1fr)",
    columnGap: 16,
    rowGap: 12,
    fontSize: 14,
    lineHeight: "20px",
  },
  address: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    lineHeight: "16px",
  },
  linkLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    lineHeight: "20px",
  },
  description: {
    fontSize: 14,
    lineHeight: "20px",
    color: "var(--muted-foreground)",
  },
});
