import * as stylex from "@stylexjs/stylex";

/** 官方 Nova 弹层外观适配 StyleX，沿用项目语义颜色和动效。 */
export const styles = stylex.create({
  positioner: { isolation: "isolate", zIndex: 50 },
  popup: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    width: 288,
    maxWidth: "calc(100vw - 16px)",
    maxHeight: "var(--available-height)",
    overflowY: "auto",
    transformOrigin: "var(--transform-origin)",
    borderRadius: "var(--radius-lg)",
    backgroundColor: "var(--popover)",
    padding: 10,
    fontSize: 14,
    color: "var(--popover-foreground)",
    boxShadow:
      "0 4px 6px -1px #0000001a, 0 0 0 1px color-mix(in srgb, var(--foreground) 10%, transparent)",
    outline: "none",
  },
});
