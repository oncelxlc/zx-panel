import * as stylex from "@stylexjs/stylex";

/** 提示框保留图标、标题、操作与错误语义，子节点依赖 slot 而非工具类。 */
export const styles = stylex.create({
  root: {
    position: "relative",
    display: "grid",
    width: "100%",
    gap: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    paddingInline: 10,
    paddingBlock: 8,
    textAlign: "start",
    fontSize: 14,
    backgroundColor: "var(--card)",
    color: "var(--card-foreground)",
    gridTemplateColumns: { default: null, ":has(>svg)": "auto 1fr" },
    columnGap: 8,
    paddingRight: { default: 10, ':has([data-slot="alert-action"])': 72 },
    "--icon-size": "16px",
  },
  destructive: { color: "var(--danger)" },
  title: {
    fontWeight: 500,
    gridColumnStart: {
      default: null,
      ':is([data-slot="alert"]:has(>svg) > *)': "2",
    },
  },
  description: {
    fontSize: 14,
    textWrap: "pretty",
    color: {
      default: "var(--muted-foreground)",
      ':is([data-slot="alert"][data-variant="destructive"] *)': "var(--danger)",
    },
    gridColumnStart: {
      default: null,
      ':is([data-slot="alert"]:has(>svg) > *)': "2",
    },
  },
  action: { position: "absolute", top: 8, right: 8 },
});
