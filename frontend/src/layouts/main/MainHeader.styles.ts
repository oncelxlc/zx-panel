import * as stylex from "@stylexjs/stylex";

/** MainHeader 的布局和响应式样式；交互控件继续使用组件库默认外观。 */
export const styles = stylex.create({
  headerLayout: {
    display: "flex",
    minHeight: 64,
    alignItems: "center",
    justifyContent: "space-between",
    gap: {
      default: 16,
      "@media (max-width: 767px)": 8,
    },
    paddingBlock: 8,
    paddingInline: {
      default: 24,
      "@media (max-width: 767px)": 16,
    },
  },
  leading: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: {
      default: 12,
      "@media (max-width: 767px)": 8,
    },
  },
  sidebarTrigger: {
    width: 44,
    height: 44,
  },
  pageTitle: {
    fontSize: 14,
    lineHeight: "20px",
    fontWeight: 500,
  },
  actions: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: {
      default: 12,
      "@media (max-width: 767px)": 8,
    },
  },
  mobileSearch: {
    width: 44,
    height: 44,
    display: {
      default: null,
      "@media (min-width: 768px)": "none",
    },
  },
  desktopSearch: {
    display: {
      default: "none",
      "@media (min-width: 768px)": "flex",
    },
    width: 256,
    justifyContent: "space-between",
  },
  shortcut: {
    fontSize: 12,
    lineHeight: "16px",
  },
  taskButton: {
    position: "relative",
    width: 44,
    height: 44,
  },
  taskCount: {
    position: "absolute",
    right: 0,
    top: 0,
  },
});
