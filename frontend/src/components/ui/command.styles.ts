import * as stylex from "@stylexjs/stylex";

/** 命令面板使用 cmdk 的选择状态，外观和搜索布局由本组件维护。 */
export const styles = stylex.create({
  root: {
    display: "flex",
    width: "100%",
    height: "100%",
    flexDirection: "column",
    overflow: "hidden",
    borderRadius: "var(--radius-xl)",
    backgroundColor: "var(--popover)",
    padding: 4,
    color: "var(--popover-foreground)",
  },
  dialog: {
    top: "33.333%",
    translate: "-50% 0",
    overflow: "hidden",
    borderRadius: "var(--radius-xl)",
    padding: 0,
  },
  wrapper: { padding: 4, paddingBottom: 0 },
  inputGroup: {
    height: 32,
    borderRadius: "var(--radius-lg)",
    borderColor: "color-mix(in srgb, var(--input) 30%, transparent)",
    backgroundColor: "color-mix(in srgb, var(--input) 30%, transparent)",
    boxShadow: "none",
  },
  input: {
    width: "100%",
    fontSize: 14,
    outline: "none",
    cursor: { default: "text", ":disabled": "not-allowed" },
    opacity: { default: 1, ":disabled": 0.5 },
  },
  addon: { paddingLeft: 8 },
  search: { width: 16, height: 16, flexShrink: 0, opacity: 0.5 },
  list: {
    scrollbarWidth: "none",
    maxHeight: 288,
    scrollPaddingBlock: 4,
    overflowX: "hidden",
    overflowY: "auto",
    outline: "none",
  },
  empty: { paddingBlock: 24, textAlign: "center", fontSize: 14 },
  group: { overflow: "hidden", padding: 4, color: "var(--foreground)" },
  heading: {
    display: "block",
    paddingInline: 8,
    paddingBlock: 6,
    fontSize: 12,
    fontWeight: 500,
    color: "var(--muted-foreground)",
  },
  separator: { marginInline: -4, height: 1, backgroundColor: "var(--border)" },
  item: {
    position: "relative",
    display: "flex",
    cursor: "default",
    alignItems: "center",
    gap: 8,
    borderRadius: {
      default: "var(--radius-sm)",
      ':is([data-slot="dialog-content"] *)': "var(--radius-lg)",
    },
    paddingInline: 8,
    paddingBlock: 6,
    fontSize: 14,
    outline: "none",
    userSelect: "none",
    pointerEvents: { default: null, ':is([data-disabled="true"])': "none" },
    opacity: { default: 1, ':is([data-disabled="true"])': 0.5 },
    backgroundColor: {
      default: "transparent",
      ':is([data-selected="true"])': "var(--muted)",
    },
    color: {
      default: "inherit",
      ':is([data-selected="true"])': "var(--foreground)",
    },
    "--icon-size": "16px",
  },
  check: {
    marginLeft: "auto",
    opacity: { default: 0, ':is([data-checked="true"] *)': 1 },
    display: {
      default: "block",
      ':is([data-slot="command-item"]:has([data-slot="command-shortcut"]) *)':
        "none",
    },
  },
  shortcut: {
    marginLeft: "auto",
    fontSize: 12,
    letterSpacing: "0.1em",
    color: {
      default: "var(--muted-foreground)",
      ':is([data-selected="true"] *)': "var(--foreground)",
    },
  },
});
