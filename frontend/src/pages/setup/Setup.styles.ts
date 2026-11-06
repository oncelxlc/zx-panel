import * as stylex from "@stylexjs/stylex";

/** Setup 的布局和响应式样式；交互控件继续使用组件库默认外观。 */
export const styles = stylex.create({
  main: {
    display: "flex",
    minHeight: "100svh",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 512,
  },
});
