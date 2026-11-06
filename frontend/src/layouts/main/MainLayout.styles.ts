import * as stylex from "@stylexjs/stylex";

/** MainLayout 的布局和响应式样式；交互控件继续使用组件库默认外观。 */
export const styles = stylex.create({
  sidebarProvider: {
    overflowX: "clip",
  },
  skipLink: {
    position: "fixed",
    zIndex: 20,
    top: 8,
    left: 8,
    transform: {
      default: "translateY(-200%)",
      ":focus": "none",
    },
  },
  sidebarInset: {
    minWidth: 0,
  },
  header: {
    position: "sticky",
    top: 0,
    zIndex: 10,
    borderBottom: "1px solid var(--border)",
    backgroundColor: "var(--background)",
  },
  panelContent: {
    width: "100%",
    maxWidth: 1600,
    marginInline: "auto",
    padding: {
      default: 24,
      "@media (max-width: 767px)": 16,
    },
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 16,
    outline: "none",
  },
  notice: {
    marginBottom: 16,
  },
});
