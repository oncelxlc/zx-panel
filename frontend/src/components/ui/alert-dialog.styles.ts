import * as stylex from "@stylexjs/stylex";

/** 确认弹层按密度排列媒体和操作，复用对话框的容器规范。 */
export const styles = stylex.create({
  content: {
    maxWidth: {
      default: 320,
      "@media (min-width: 640px)": {
        default: 384,
        ':is([data-size="sm"])': 320,
      },
    },
  },
  header: {
    display: "grid",
    gridTemplateRows: "auto 1fr",
    justifyItems: { default: "center", "@media (min-width: 640px)": "start" },
    gap: 6,
    textAlign: { default: "center", "@media (min-width: 640px)": "left" },
  },
  footer: {
    display: {
      default: "flex",
      ':is([data-slot="alert-dialog-content"][data-size="sm"] *)': "grid",
    },
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  },
  media: {
    marginBottom: 8,
    display: "inline-flex",
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "var(--radius-md)",
    backgroundColor: "var(--muted)",
    "--icon-size": "24px",
  },
  title: { fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 500 },
  description: {
    fontSize: 14,
    textWrap: "pretty",
    color: "var(--muted-foreground)",
  },
});
