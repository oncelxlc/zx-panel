import * as stylex from "@stylexjs/stylex";

/** Logs 的布局和响应式样式；交互控件继续使用组件库默认外观。 */
export const styles = stylex.create({
  virtualSpace: (height: number) => ({
    height,
    width: "100%",
    position: "relative",
  }),
  virtualRow: (start: number, height: number) => ({
    transform: `translateY(${start}px)`,
    height,
  }),
  error: { color: "var(--danger)" },
  warning: { color: "var(--warning)" },
  pageStack: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    minWidth: 0,
  },
  cardContent: {
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
  input: {
    maxWidth: 320,
  },
  logLines: {
    position: "relative",
    overflow: "auto",
    height: "min(60vh, 620px)",
    minHeight: 280,
    contain: "strict",
    borderRadius: "var(--radius-lg)",
    border: "1px solid var(--border)",
    backgroundColor: "color-mix(in srgb, var(--muted) 20%, transparent)",
  },
  logRow: {
    position: "absolute",
    top: 0,
    left: 0,
    display: "flex",
    width: "max-content",
    minWidth: "100%",
    gap: 12,
    paddingInline: 12,
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    lineHeight: "28px",
  },
  timestamp: {
    color: "var(--muted-foreground)",
  },
  message: {
    whiteSpace: "pre",
  },
  empty: {
    padding: 16,
    fontSize: 14,
    lineHeight: "20px",
    color: "var(--muted-foreground)",
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
  actions: {
    display: "flex",
    gap: 8,
  },
});
