import * as stylex from "@stylexjs/stylex";

/** Shared 的布局和响应式样式；交互控件继续使用组件库默认外观。 */
export const styles = stylex.create({
  pageHeading: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },
  heading: {
    fontSize: 24,
    lineHeight: "32px",
    fontWeight: 600,
    letterSpacing: "-0.025em",
  },
  description: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: "20px",
    color: "var(--muted-foreground)",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  placeholder: {
    display: "grid",
    gap: 16,
  },
  summarySkeleton: {
    height: 112,
    width: "100%",
  },
  tableSkeleton: {
    height: 192,
    width: "100%",
  },
  queryContent: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    minWidth: 0,
  },
  stack: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  chartSkeleton: {
    height: 240,
    width: "100%",
  },
  chartActionsSkeleton: {
    height: {
      default: 44,
      "@media (min-width: 768px)": 28,
    },
    width: "100%",
  },
  metricCard: {
    minHeight: 144,
  },
  labelRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  metricIcon: {
    width: 16,
    height: 16,
  },
  metricValue: {
    fontFamily: "var(--font-mono)",
    fontSize: 30,
    lineHeight: "36px",
    fontWeight: 600,
    letterSpacing: "-0.025em",
    fontVariantNumeric: "tabular-nums",
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
  caption: {
    fontSize: 12,
    lineHeight: "16px",
    color: "var(--muted-foreground)",
  },
  copyRow: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: 4,
  },
  copyValue: {
    maxWidth: 320,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 12,
    lineHeight: "16px",
  },
});
