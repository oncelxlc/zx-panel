import * as stylex from "@stylexjs/stylex";

/** 菜单只定义视图；定位、嵌套导航、选中和焦点继续交给 Base UI。 */
export const styles = stylex.create({
  positioner: { isolation: "isolate", zIndex: 50, outlineWidth: 0 },
  popup: {
    zIndex: 50,
    maxHeight: "var(--available-height)",
    width: "var(--anchor-width)",
    minWidth: 128,
    transformOrigin: "var(--transform-origin)",
    overflowX: "hidden",
    overflowY: "auto",
    borderRadius: 8,
    backgroundColor: "var(--popover)",
    padding: 4,
    color: "var(--popover-foreground)",
    boxShadow:
      "0 4px 6px -1px #0000001a, 0 0 0 1px color-mix(in srgb, var(--foreground) 10%, transparent)",
    outlineWidth: 0,
  },
  subPopup: { width: "auto", minWidth: 96 },
  label: {
    paddingInline: 6,
    paddingBlock: 4,
    fontSize: 12,
    fontWeight: 500,
    color: "var(--muted-foreground)",
    paddingLeft: { default: 6, ":is([data-inset])": 28 },
  },
  item: {
    position: "relative",
    display: "flex",
    cursor: "default",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    paddingInline: 6,
    paddingBlock: 4,
    fontSize: 14,
    outlineWidth: 0,
    userSelect: "none",
    backgroundColor: {
      default: "transparent",
      ":focus": "var(--accent)",
      ":is([data-highlighted], [data-popup-open], [data-open])":
        "var(--accent)",
    },
    color: {
      default: "inherit",
      ":focus": "var(--accent-foreground)",
      ':is([data-variant="destructive"])': "var(--danger)",
    },
    paddingLeft: { default: 6, ":is([data-inset])": 28 },
    opacity: { default: 1, ":is([data-disabled])": 0.5 },
    pointerEvents: { default: "auto", ":is([data-disabled])": "none" },
    "--icon-size": "16px",
  },
  choice: { paddingRight: 32 },
  indicator: {
    pointerEvents: "none",
    position: "absolute",
    right: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  chevron: { marginLeft: "auto" },
  separator: {
    marginInline: -4,
    marginBlock: 4,
    height: 1,
    backgroundColor: "var(--border)",
  },
  shortcut: {
    marginLeft: "auto",
    fontSize: 12,
    letterSpacing: "0.1em",
    color: {
      default: "var(--muted-foreground)",
      ':is([data-slot="dropdown-menu-item"]:focus *)':
        "var(--accent-foreground)",
    },
  },
});
