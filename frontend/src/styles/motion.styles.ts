import * as stylex from "@stylexjs/stylex";

/** 内容淡入只影响透明度，不改变文档布局。 */
const reveal = stylex.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });

/** Base UI 生命周期属性统一驱动可取消过渡，减少动态效果时立即到达终态。 */
export const motion = stylex.create({
  popup: {
    transitionProperty: "opacity, scale",
    transitionTimingFunction: "var(--motion-ease)",
    transitionDuration: {
      default: "var(--motion-content)",
      ":is([data-ending-style])": "var(--motion-fast)",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    opacity: {
      default: 1,
      ":is([data-starting-style], [data-ending-style])": 0,
      ':is([data-align-trigger="true"])': 1,
    },
    scale: {
      default: "1",
      ":is([data-starting-style], [data-ending-style])": "0.98",
      ':is([data-align-trigger="true"])': "1",
    },
  },
  overlay: {
    transitionProperty: "opacity",
    transitionTimingFunction: "ease-out",
    transitionDuration: {
      default: "var(--motion-content)",
      ":is([data-ending-style])": "var(--motion-exit)",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    opacity: {
      default: 1,
      ":is([data-starting-style], [data-ending-style])": 0,
    },
  },
  sheet: {
    transitionProperty: "translate, opacity",
    transitionTimingFunction: "var(--motion-ease)",
    transitionDuration: {
      default: "var(--motion-panel)",
      ":is([data-ending-style])": "var(--motion-exit)",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    opacity: {
      default: 1,
      ":is([data-starting-style], [data-ending-style])": 0,
    },
  },
  content: {
    animationName: reveal,
    animationDuration: {
      default: "var(--motion-content)",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    animationTimingFunction: "ease-out",
    animationFillMode: "both",
  },
  placeholder: {
    animationName: reveal,
    animationDuration: {
      default: "var(--motion-fast)",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    animationDelay: {
      default: "var(--motion-fast)",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    animationTimingFunction: "ease-out",
    animationFillMode: "both",
  },
});
