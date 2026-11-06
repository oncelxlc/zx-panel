import * as stylex from "@stylexjs/stylex";

/** 提示内容与箭头使用统一前景色，定位仍由 Base UI 提供。 */
export const styles = stylex.create({
  positioner: { isolation: "isolate", zIndex: 50 },
  popup: {
    zIndex: 50,
    display: "inline-flex",
    width: "fit-content",
    maxWidth: 320,
    transformOrigin: "var(--transform-origin)",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    backgroundColor: "var(--foreground)",
    paddingInline: 12,
    paddingBlock: 6,
    fontSize: 12,
    color: "var(--background)",
  },
  arrow: {
    zIndex: 50,
    width: 10,
    height: 10,
    translate: {
      default: "0 calc(-50% - 2px)",
      ':is([data-side="left"], [data-side="right"], [data-side="inline-start"], [data-side="inline-end"])':
        "0 -50%",
    },
    rotate: "45deg",
    borderRadius: 2,
    backgroundColor: "var(--foreground)",
    fill: "var(--foreground)",
    top: {
      default: null,
      ':is([data-side="bottom"])': 4,
      ':is([data-side="left"], [data-side="right"], [data-side="inline-start"], [data-side="inline-end"])':
        "50%",
    },
    left: {
      default: null,
      ':is([data-side="right"], [data-side="inline-end"])': -4,
    },
    right: {
      default: null,
      ':is([data-side="left"], [data-side="inline-start"])': -4,
    },
    bottom: { default: null, ':is([data-side="top"])': -10 },
  },
});
