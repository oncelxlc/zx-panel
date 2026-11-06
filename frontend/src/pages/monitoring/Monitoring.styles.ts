import * as stylex from "@stylexjs/stylex";

/** Monitoring 的布局和响应式样式；交互控件继续使用组件库默认外观。 */
export const styles = stylex.create({
  detailValue: { margin: 0, overflowWrap: "anywhere" },
  pageStack: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    minWidth: 0,
  },
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
  },
  status: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  caption: {
    fontSize: 12,
    lineHeight: "16px",
    color: "var(--muted-foreground)",
  },
  cores: {
    display: "grid",
    gap: 20,
    gridTemplateColumns: {
      default: null,
      "@media (min-width: 640px)": "repeat(2, minmax(0, 1fr))",
      "@media (min-width: 1280px)": "repeat(4, minmax(0, 1fr))",
    },
  },
  core: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  coreLabel: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 14,
    lineHeight: "20px",
  },
  value: {
    fontFamily: "var(--font-mono)",
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(90px, auto) minmax(0, 1fr)",
    columnGap: 16,
    rowGap: 12,
    fontSize: 14,
    lineHeight: "20px",
  },
  chartGrid: {
    display: "grid",
    gap: 16,
    gridTemplateColumns: {
      default: null,
      "@media (min-width: 1280px)": "repeat(2, minmax(0, 1fr))",
    },
  },
});
