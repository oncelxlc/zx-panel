import * as stylex from "@stylexjs/stylex";

/** 分隔线由 Base UI 的方向属性控制，不改变其原生语义。 */
export const styles = stylex.create({
  root: { flexShrink: 0, backgroundColor: "var(--border)" },
  horizontal: { height: 1, width: "100%" },
  vertical: { width: 1, alignSelf: "stretch" },
});
