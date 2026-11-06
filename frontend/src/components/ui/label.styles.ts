import * as stylex from "@stylexjs/stylex";

/** 字段标签沿用标准字体与禁用反馈，保持可见文字关联。 */
export const styles = stylex.create({
  root: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    lineHeight: 1,
    fontWeight: 500,
    userSelect: "none",
    opacity: { default: 1, ':is([data-disabled="true"] *)': 0.5 },
    cursor: { default: "inherit", ":has(+ :disabled)": "not-allowed" },
  },
});
