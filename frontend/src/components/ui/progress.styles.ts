import * as stylex from "@stylexjs/stylex";

/** 进度条维持固定几何尺寸，动态值只改变填充位移。 */
export const styles = stylex.create({
  root: { display: "flex", flexWrap: "wrap", gap: 12 },
  track: {
    position: "relative",
    display: "flex",
    height: 4,
    width: "100%",
    alignItems: "center",
    overflowX: "hidden",
    borderRadius: 9999,
    backgroundColor: "var(--muted)",
  },
  indicator: {
    height: "100%",
    backgroundColor: "var(--primary)",
    transitionProperty: "transform",
    transitionDuration: {
      default: "var(--motion-content)",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
  },
  fill: (width: string) => ({
    width: "100%",
    transform: `translateX(calc(${width} - 100%))`,
  }),
  label: { fontSize: 14, fontWeight: 500 },
  value: {
    marginLeft: "auto",
    fontSize: 14,
    color: "var(--muted-foreground)",
    fontVariantNumeric: "tabular-nums",
  },
});
