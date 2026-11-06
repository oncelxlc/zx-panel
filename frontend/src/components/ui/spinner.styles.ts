import * as stylex from "@stylexjs/stylex";

/** 加载图标沿中心旋转，不改变命中范围。 */
const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });
/** 辅助技术保留组件的状态文案，减少动态效果时不旋转。 */
export const styles = stylex.create({
  root: {
    width: 16,
    height: 16,
    animationName: spin,
    animationDuration: "1s",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
    animationPlayState: {
      default: "running",
      "@media (prefers-reduced-motion: reduce)": "paused",
    },
  },
});
