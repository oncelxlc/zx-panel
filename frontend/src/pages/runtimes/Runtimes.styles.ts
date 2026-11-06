import * as stylex from "@stylexjs/stylex";

/** Runtimes 的布局和响应式样式；交互控件继续使用组件库默认外观。 */
export const styles = stylex.create({
  pageStack: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    minWidth: 0,
  },
  runtimeGrid: {
    display: "grid",
    gap: 16,
    gridTemplateColumns: {
      default: null,
      "@media (min-width: 1024px)": "repeat(2, minmax(0, 1fr))",
    },
  },
  cardContent: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  version: {
    overflowWrap: "break-word",
    fontFamily: "var(--font-mono)",
    fontSize: 24,
    lineHeight: "32px",
    fontWeight: 600,
  },
  description: {
    fontSize: 14,
    lineHeight: "20px",
    color: "var(--muted-foreground)",
  },
  badges: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  caption: {
    fontSize: 12,
    lineHeight: "16px",
    color: "var(--muted-foreground)",
  },
  versionDetails: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
  },
  status: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  sheetContent: {
    overflowY: "auto",
    maxWidth: {
      default: null,
      "@media (min-width: 640px)": 576,
    },
  },
  sheetBody: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    paddingInline: 16,
    paddingBottom: 16,
  },
});
