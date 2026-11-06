import * as stylex from "@stylexjs/stylex";

/** MainSider 的布局和响应式样式；交互控件继续使用组件库默认外观。 */
export const styles = stylex.create({
  brandMedia: { alignSelf: "center", translate: "none" },
  sidebarBrand: {
    minWidth: 0,
    overflow: "hidden",
    flexWrap: "nowrap",
    paddingInline: 8,
  },
  label: {
    whiteSpace: "nowrap",
    opacity: {
      default: 1,
      ':is([data-slot="sidebar"][data-collapsible="icon"] *)': 0,
    },
    translate: {
      default: "0 0",
      ':is([data-slot="sidebar"][data-collapsible="icon"] *)': "-4px 0",
    },
    transitionProperty: "opacity, translate",
    transitionDuration: {
      default: "var(--motion-content)",
      ':is([data-slot="sidebar"][data-collapsible="icon"] *)': "var(--motion-fast)",
    },
    transitionTimingFunction: "var(--motion-ease)",
    transitionDelay: {
      default: "var(--motion-fast)",
      ':is([data-slot="sidebar"][data-collapsible="icon"] *)': "0s",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    minWidth: 0,
  },
  sidebarMenu: {
    gap: 8,
  },
  sidebarMenuButton: {
    height: {
      default: 40,
      "@media (max-width: 1023px)": 44,
      "@media (pointer: coarse)": 44,
    },
    paddingInline: 16,
  },
  menuLabel: {
    flexShrink: 0,
  },
  footer: {
    // 桌面预留两行空间，按钮只平移，避免切换排列方向导致瞬移和内容区跳动。
    height: { default: 112, "@media (max-width: 1023px)": 60 },
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  footerMotion: {
    display: "flex",
    flexShrink: 0,
    transitionProperty: "translate",
    transitionDuration: "var(--sidebar-motion-duration, var(--motion-layout))",
    transitionTimingFunction: "var(--motion-ease-layout)",
  },
  footerTheme: {
    translate: {
      default: "0 0",
      ':is([data-slot="sidebar"][data-collapsible="icon"] *)': "0 -52px",
    },
  },
  footerAccount: {
    translate: {
      default: "0 0",
      ':is([data-slot="sidebar"][data-collapsible="icon"] *)': "-52px 0",
    },
  },
  footerButton: { width: 44, height: 44, flexShrink: 0 },
  accountMenu: { width: 200 },
});
