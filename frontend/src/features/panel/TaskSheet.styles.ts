import * as stylex from "@stylexjs/stylex";

/** TaskSheet 的布局和响应式样式；交互控件继续使用组件库默认外观。 */
export const styles = stylex.create({
  sheetContent: {
    width: "100%",
    maxWidth: {
      default: null,
      "@media (min-width: 640px)": 640,
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
    paddingBottom: 16,
  },
  description: {
    fontSize: 14,
    lineHeight: "20px",
    color: "var(--muted-foreground)",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
  },
  taskHeading: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
  },
  summary: {
    fontSize: 14,
    lineHeight: "20px",
  },
  caption: {
    fontSize: 12,
    lineHeight: "16px",
    color: "var(--muted-foreground)",
  },
  errorDetails: {
    overflow: "auto",
    borderRadius: "var(--radius-lg)",
    backgroundColor: "var(--muted)",
    padding: 12,
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    lineHeight: "16px",
    whiteSpace: "pre-wrap",
  },
  logs: {
    borderRadius: "var(--radius-lg)",
    border: "1px solid var(--border)",
    backgroundColor: "color-mix(in srgb, var(--muted) 30%, transparent)",
    padding: 12,
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    lineHeight: "20px",
  },
  logLine: {
    wordBreak: "break-all",
  },
});
