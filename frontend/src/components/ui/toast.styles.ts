import * as stylex from "@stylexjs/stylex";

/** 通知堆叠读取 Base UI 提供的测量值，展开和滑动均保留原有时序。 */
export const styles = stylex.create({
  layer: (index: number) => ({ zIndex: 1000 - index }),
  viewport: {
    pointerEvents: "none",
    position: "fixed",
    top: 16,
    right: 16,
    zIndex: 100,
    width: "calc(100% - 2rem)",
    maxWidth: 384,
    outline: "none",
  },
  root: {
    pointerEvents: { default: "auto", ":is([data-limited])": "none" },
    position: "absolute",
    top: 0,
    right: 0,
    zIndex: 1000,
    width: "100%",
    transformOrigin: "top",
    borderRadius: "var(--radius-2xl)",
    border: "1px solid var(--border)",
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    boxShadow: "0 10px 15px -3px #0000001a, 0 4px 6px -4px #0000001a",
    outline: { default: "none", ":focus-visible": "3px solid var(--ring)" },
    userSelect: "none",
    "--gap": "0.75rem",
    "--height": "var(--toast-frontmost-height, var(--toast-height))",
    "--offset-y":
      "calc(var(--toast-offset-y) + var(--toast-index) * var(--gap) + var(--toast-swipe-movement-y))",
    "--peek": "0.75rem",
    "--scale": "calc(max(0, 1 - (var(--toast-index) * 0.1)))",
    "--shrink": "calc(1 - var(--scale))",
    height: {
      default: "var(--height)",
      ":is([data-expanded])": "var(--toast-height)",
    },
    opacity: { default: 1, ":is([data-limited])": 0 },
    transform: {
      default:
        "translateX(var(--toast-swipe-movement-x)) translateY(calc(var(--toast-swipe-movement-y) + (var(--toast-index) * var(--peek)) + (var(--shrink) * var(--height)))) scale(var(--scale))",
      ":is([data-expanded])":
        "translateX(var(--toast-swipe-movement-x)) translateY(var(--offset-y))",
      ":is([data-starting-style])": "translateY(-150%)",
      ":is([data-ending-style]):not([data-limited]):not([data-swipe-direction])":
        "translateY(-150%)",
      ':is([data-ending-style][data-swipe-direction="down"])':
        "translateY(calc(var(--toast-swipe-movement-y) + 150%))",
      ':is([data-ending-style][data-swipe-direction="left"])':
        "translateX(calc(var(--toast-swipe-movement-x) - 150%)) translateY(var(--offset-y))",
      ':is([data-ending-style][data-swipe-direction="right"])':
        "translateX(calc(var(--toast-swipe-movement-x) + 150%)) translateY(var(--offset-y))",
      ':is([data-ending-style][data-swipe-direction="up"])':
        "translateY(calc(var(--toast-swipe-movement-y) - 150%))",
    },
    transitionProperty: "transform, opacity",
    transitionDuration: {
      default: "var(--motion-panel), var(--motion-exit)",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionTimingFunction: "var(--motion-ease), ease-out",
    transitionDelay: {
      default: "var(--motion-fast)",
      ":is([data-expanded], [data-starting-style], [data-ending-style])": "0s",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    "::after": {
      content: '""',
      position: "absolute",
      bottom: "100%",
      left: 0,
      height: "calc(var(--gap) + 1px)",
      width: "100%",
    },
  },
  content: {
    display: "flex",
    height: "100%",
    alignItems: "center",
    gap: 12,
    overflow: "hidden",
    padding: 16,
    opacity: { default: 1, ":is([data-behind]):not([data-expanded])": 0 },
    transitionProperty: "opacity",
    transitionDuration: {
      default: "var(--motion-fast)",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionTimingFunction: "ease-out",
    transitionDelay: {
      default: "0s",
      ":is([data-expanded])": "var(--motion-panel)",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
  },
  title: { fontSize: 14, fontWeight: 500, overflowWrap: "anywhere" },
  description: {
    fontSize: 14,
    color: "var(--muted-foreground)",
    overflowWrap: "anywhere",
  },
  action: { flexShrink: 0 },
  close: {
    position: "relative",
    flexShrink: 0,
    color: {
      default: "var(--muted-foreground)",
      ":hover": "var(--foreground)",
    },
    "::after": { content: '""', position: "absolute", inset: -8 },
  },
  icon: { flexShrink: 0, "--icon-size": "16px" },
  error: { color: "var(--danger)" },
  behind: {
    pointerEvents: {
      default: "auto",
      ":not([data-expanded])": "none",
      ":is([data-limited])": "none",
    },
    opacity: {
      default: 1,
      ":not([data-expanded])": 0,
      ":is([data-limited])": 0,
    },
  },
  text: {
    display: "flex",
    minWidth: 0,
    flex: 1,
    flexDirection: "column",
    gap: 4,
  },
});
