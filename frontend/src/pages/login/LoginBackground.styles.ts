import * as stylex from "@stylexjs/stylex";

/** 单张线稿铺满页面；窄屏降低装饰对表单的干扰，不产生背景切换。 */
export const styles = stylex.create({
  root: {
    position: "absolute",
    zIndex: -1,
    inset: 0,
    overflow: "clip",
    pointerEvents: "none",
    opacity: { default: 0.6, "@media (max-width: 1023px)": 0.12 },
  },
  image: {
    position: "absolute",
    width: "100%",
    height: "100%",
    objectFit: "cover",
    filter: "grayscale(1)",
    objectPosition: {
      default: "left center",
      "@media (max-width: 767px)": "30% center",
    },
  },
});
