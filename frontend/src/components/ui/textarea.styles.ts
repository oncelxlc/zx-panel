import * as stylex from "@stylexjs/stylex";

/** 多行输入复用 Input 的状态样式，仅定义内容增长与垂直留白。 */
export const styles = stylex.create({
  root: {
    display: "flex",
    height: "auto",
    minHeight: 64,
    fieldSizing: "content",
    paddingBlock: 8,
  },
});
