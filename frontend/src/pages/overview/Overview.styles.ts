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
    containerType: "inline-size",
  },
  trendGrid: {
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@container (min-width: 600px)": "repeat(2, minmax(0, 1fr))",
    },
    gap: 24,
    alignItems: "start",
  },
  trend: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minWidth: 0,
  },
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
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
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@container (min-width: 600px)": "repeat(2, minmax(0, 1fr))",
      "@container (min-width: 900px)": "repeat(3, minmax(0, 1fr))",
    },
    gap: 24,
  },
  detailItem: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 0,
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
