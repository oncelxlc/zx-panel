import * as stylex from "@stylexjs/stylex";

/** 骨架只改变透明度，避免影响布局。 */
const pulse = stylex.keyframes({ "50%": { opacity: 0.5 } });
/** 减少动态效果时保留静态占位。 */
export const styles = stylex.create({
  root: {
    borderRadius: 8,
    backgroundColor: "var(--muted)",
    animationName: pulse,
    animationDuration: "2s",
    animationTimingFunction: "cubic-bezier(0.4, 0, 0.6, 1)",
    animationIterationCount: "infinite",
    animationPlayState: {
      default: "running",
      "@media (prefers-reduced-motion: reduce)": "paused",
    },
  },
});
