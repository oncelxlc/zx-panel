import * as stylex from "@stylexjs/stylex";

/** 面包屑保留语义链接、当前页和装饰分隔符的层次。 */
export const styles = stylex.create({
  root: {},
  list: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    fontSize: 14,
    overflowWrap: "break-word",
    color: "var(--muted-foreground)",
  },
  item: { display: "inline-flex", alignItems: "center", gap: 4 },
  link: {
    transitionProperty: "color",
    transitionDuration: "var(--motion-fast)",
    color: { default: "inherit", ":hover": "var(--foreground)" },
  },
  page: { fontWeight: 400, color: "var(--foreground)" },
  separator: { display: "inline-flex", "--icon-size": "14px" },
  ellipsis: {
    display: "flex",
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    "--icon-size": "16px",
  },
  hidden: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  },
});
