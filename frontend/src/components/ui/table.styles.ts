import * as stylex from "@stylexjs/stylex";

/** 表格保持原生表格布局、横向滚动、行状态和勾选列留白。 */
export const styles = stylex.create({
  container: { position: "relative", width: "100%", overflowX: "auto" },
  root: {
    width: "100%",
    captionSide: "bottom",
    fontSize: 14,
    borderCollapse: "collapse",
  },
  header: {},
  body: {},
  footer: {
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "var(--border)",
    backgroundColor: "color-mix(in srgb, var(--muted) 50%, transparent)",
    fontWeight: 500,
  },
  row: {
    borderBottomWidth: {
      default: 1,
      ":is(tbody > :last-child, tfoot > :last-child)": 0,
    },
    borderBottomStyle: "solid",
    borderBottomColor: "var(--border)",
    transitionProperty: "background-color",
    transitionDuration: "var(--motion-fast)",
    backgroundColor: {
      default: "transparent",
      ":hover": "color-mix(in srgb, var(--muted) 50%, transparent)",
      ':has([aria-expanded="true"])':
        "color-mix(in srgb, var(--muted) 50%, transparent)",
      ':is([data-state="selected"])': "var(--muted)",
    },
  },
  head: {
    height: 40,
    paddingInline: 8,
    textAlign: "start",
    verticalAlign: "middle",
    fontWeight: 500,
    whiteSpace: "nowrap",
    color: "var(--foreground)",
    paddingRight: { default: 8, ':has([role="checkbox"])': 0 },
  },
  cell: {
    padding: 8,
    verticalAlign: "middle",
    whiteSpace: "nowrap",
    paddingRight: { default: 8, ':has([role="checkbox"])': 0 },
  },
  caption: { marginTop: 16, fontSize: 14, color: "var(--muted-foreground)" },
});
