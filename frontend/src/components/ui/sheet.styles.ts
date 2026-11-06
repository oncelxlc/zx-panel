import * as stylex from "@stylexjs/stylex";

/** 四向抽屉在自身状态属性上定义滑入方向，关闭时可平滑反向过渡。 */
export const styles = stylex.create({
  content: {
    position: "fixed",
    zIndex: 50,
    display: "flex",
    flexDirection: "column",
    gap: 16,
    backgroundColor: "var(--popover)",
    backgroundClip: "padding-box",
    fontSize: 14,
    color: "var(--popover-foreground)",
    boxShadow: "0 10px 15px -3px #0000001a, 0 4px 6px -4px #0000001a",
    outline: "none",
    translate: {
      default: "0",
      ':is([data-side="left"][data-starting-style], [data-side="left"][data-ending-style])':
        "-40px 0",
      ':is([data-side="right"][data-starting-style], [data-side="right"][data-ending-style])':
        "40px 0",
      ':is([data-side="top"][data-starting-style], [data-side="top"][data-ending-style])':
        "0 -40px",
      ':is([data-side="bottom"][data-starting-style], [data-side="bottom"][data-ending-style])':
        "0 40px",
    },
  },
  left: {
    insetBlock: 0,
    left: 0,
    height: "100%",
    width: "75%",
    maxWidth: { default: null, "@media (min-width: 640px)": 384 },
    borderRight: "1px solid var(--border)",
  },
  right: {
    insetBlock: 0,
    right: 0,
    height: "100%",
    width: "75%",
    maxWidth: { default: null, "@media (min-width: 640px)": 384 },
    borderLeft: "1px solid var(--border)",
  },
  top: {
    insetInline: 0,
    top: 0,
    height: "auto",
    borderBottom: "1px solid var(--border)",
  },
  bottom: {
    insetInline: 0,
    bottom: 0,
    height: "auto",
    borderTop: "1px solid var(--border)",
  },
  header: { display: "flex", flexDirection: "column", gap: 2, padding: 16 },
  footer: {
    marginTop: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 16,
  },
  title: {
    fontFamily: "var(--font-heading)",
    fontSize: 16,
    fontWeight: 500,
    color: "var(--foreground)",
  },
  description: { fontSize: 14, color: "var(--muted-foreground)" },
  close: { position: "absolute", top: 12, right: 12 },
});
