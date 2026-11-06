import * as stylex from "@stylexjs/stylex";

/** ThemeToggle 的布局和响应式样式；交互控件继续使用组件库默认外观。 */
export const styles = stylex.create({
  button: {
    width: 44,
    height: 44,
    flexShrink: 0,
  },
  content: { width: 260, gap: 12 },
  field: { gap: 0 },
  options: { width: "100%" },
  option: { flex: 1 },
});
