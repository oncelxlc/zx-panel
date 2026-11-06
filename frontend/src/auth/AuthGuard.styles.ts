import * as stylex from "@stylexjs/stylex";

/** AuthGuard 的布局和响应式样式；交互控件继续使用组件库默认外观。 */
export const styles = stylex.create({
  div: {
    display: "flex",
    minHeight: "100svh",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  div1: {
    margin: "auto",
    maxWidth: 512,
    padding: 24,
  },
});
