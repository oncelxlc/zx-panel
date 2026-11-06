import * as stylex from "@stylexjs/stylex";

/** 字段保持组件库的分组与响应式布局；错误槽固定两行，可滚动读取更长反馈。 */
export const styles = stylex.create({
  set: { display: "flex", flexDirection: "column", gap: 16 },
  legend: {
    marginBottom: 6,
    fontWeight: 500,
    fontSize: { default: 16, ':is([data-variant="label"])': 14 },
  },
  group: {
    display: "flex",
    width: "100%",
    flexDirection: "column",
    gap: 20,
    containerType: "inline-size",
  },
  root: {
    display: "flex",
    width: "100%",
    gap: 8,
    color: { default: null, ':is([data-invalid="true"])': "var(--danger)" },
  },
  vertical: { flexDirection: "column" },
  horizontal: { flexDirection: "row", alignItems: "center" },
  responsive: {
    flexDirection: {
      default: "column",
      "@container (min-width: 28rem)": "row",
    },
  },
  content: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: 2,
    lineHeight: 1.375,
  },
  label: {
    display: "flex",
    width: "fit-content",
    gap: 8,
    lineHeight: 1.375,
    opacity: {
      default: 1,
      ':is([data-slot="field"][data-disabled="true"] *)': 0.5,
    },
  },
  title: {
    display: "flex",
    width: "fit-content",
    gap: 8,
    fontSize: 14,
    fontWeight: 500,
    lineHeight: 1.375,
  },
  description: {
    color: "var(--muted-foreground)",
    fontSize: 14,
    lineHeight: 1.5,
    fontWeight: 400,
    textAlign: "start",
  },
  separator: {
    position: "relative",
    marginBlock: -8,
    height: 20,
    fontSize: 14,
  },
  separatorLine: { position: "absolute", insetInline: 0, top: "50%" },
  separatorContent: {
    position: "relative",
    display: "block",
    width: "fit-content",
    marginInline: "auto",
    paddingInline: 8,
    backgroundColor: "var(--background)",
    color: "var(--muted-foreground)",
  },
  error: {
    height: 40,
    minHeight: 40,
    overflowY: "auto",
    scrollbarWidth: "thin",
    color: "var(--danger)",
    fontSize: 14,
    fontWeight: 400,
    lineHeight: "20px",
    overflowWrap: "anywhere",
  },
  errorCompact: {
    height: 32,
    minHeight: 32,
    fontSize: 12,
    lineHeight: "16px",
  },
  errorList: {
    marginInlineStart: 16,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    listStyleType: "disc",
  },
});
