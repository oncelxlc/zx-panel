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
  sidebarLabel: {
    whiteSpace: "nowrap",
    opacity: {
      default: 1,
      ':is([data-slot="sidebar"][data-collapsible="icon"] *)': 0,
    },
    transitionProperty: "opacity",
    transitionDuration: "var(--motion-fast)",
    transitionTimingFunction: "ease-out",
    transitionDelay: {
      default: "var(--motion-panel)",
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
    whiteSpace: "nowrap",
    opacity: {
      default: 1,
      ':is([data-slot="sidebar"][data-collapsible="icon"] *)': 0,
    },
    transitionProperty: "opacity",
    transitionDuration: "var(--motion-fast)",
    transitionTimingFunction: "ease-out",
    transitionDelay: {
      default: "var(--motion-panel)",
      ':is([data-slot="sidebar"][data-collapsible="icon"] *)': "0s",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    flexShrink: 0,
  },
  footer: {
    flexDirection: {
      default: "row",
      ':is([data-slot="sidebar"][data-collapsible="icon"] *)': "column",
    },
    alignItems: "flex-start",
    gap: 8,
  },
  footerButton: { width: 44, height: 44, flexShrink: 0 },
  accountMenu: { width: 200 },
});
