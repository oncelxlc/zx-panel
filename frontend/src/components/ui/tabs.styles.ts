import * as stylex from "@stylexjs/stylex";

/** 标签页依照 Base UI 的激活和方向属性显示状态。 */
export const styles = stylex.create({
  root: {
    display: "flex",
    gap: 8,
    flexDirection: {
      default: "column",
      ':is([data-orientation="vertical"])': "row",
    },
  },
  list: {
    display: "inline-flex",
    width: "fit-content",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: {
      default: "var(--radius-lg)",
      ':is([data-variant="line"])': 0,
    },
    padding: 3,
    color: "var(--muted-foreground)",
    height: {
      default: 32,
      ':is([data-orientation="vertical"] *)': "fit-content",
    },
    flexDirection: {
      default: "row",
      ':is([data-orientation="vertical"] *)': "column",
    },
    gap: { default: 0, ':is([data-variant="line"])': 4 },
    backgroundColor: {
      default: "var(--muted)",
      ':is([data-variant="line"])': "transparent",
    },
  },
  trigger: {
    position: "relative",
    display: "inline-flex",
    height: "calc(100% - 1px)",
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: "var(--radius-md)",
    border: "1px solid transparent",
    paddingInline: 6,
    paddingBlock: 2,
    fontSize: 14,
    fontWeight: 500,
    whiteSpace: "nowrap",
    cursor: "pointer",
    color: {
      default: "var(--muted-foreground)",
      ":hover": "var(--foreground)",
      ":is([data-active])": "var(--foreground)",
    },
    outline: { default: "none", ":focus-visible": "3px solid var(--ring)" },
    pointerEvents: {
      default: null,
      ':is(:disabled, [aria-disabled="true"])': "none",
    },
    opacity: { default: 1, ':is(:disabled, [aria-disabled="true"])': 0.5 },
    backgroundColor: {
      default: "transparent",
      ":is([data-active])": "var(--background)",
      ':is([data-variant="line"] [data-active])': "transparent",
    },
    boxShadow: {
      default: null,
      ':is([data-variant="default"] [data-active])': "0 1px 2px #0000000d",
    },
    borderBottomColor: {
      default: "transparent",
      ':is([data-variant="line"] [data-active])': "var(--foreground)",
    },
    "--icon-size": "16px",
  },
  content: { flex: 1, fontSize: 14, outline: "none" },
});
