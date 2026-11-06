import * as stylex from "@stylexjs/stylex";

/** 卡片的布局与语义外观；子组件通过卡片属性读取尺寸，不依赖页面选择器。 */
export const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--card-spacing)",
    overflow: "hidden",
    borderRadius: 16,
    backgroundColor: "var(--card)",
    color: "var(--card-foreground)",
    fontSize: 14,
    paddingBlock: "var(--card-spacing)",
    paddingBottom: {
      default: "var(--card-spacing)",
      ':has(>[data-slot="card-footer"])': 0,
    },
    boxShadow:
      "0 0 0 1px color-mix(in srgb, var(--foreground) 10%, transparent)",
    "--card-spacing": {
      default: "16px",
      ':is([data-size="sm"])': "12px",
      ':is([data-size="lg"])': {
        default: "24px",
        "@media (min-width: 640px)": "32px",
      },
    },
  },
  glass: {
    backdropFilter: "blur(24px)",
    backgroundImage:
      "linear-gradient(145deg, color-mix(in srgb, var(--foreground) 5%, transparent), transparent 55%)",
    boxShadow:
      "var(--shadow-glass), 0 0 0 1px color-mix(in srgb, var(--foreground) 18%, transparent), inset 0 1px 0 color-mix(in srgb, var(--foreground) 12%, transparent)",
  },
  header: {
    display: "grid",
    gridAutoRows: "min-content",
    alignItems: "start",
    gap: 4,
    paddingInline: "var(--card-spacing)",
    containerType: "inline-size",
    gridTemplateColumns: {
      default: null,
      ':has([data-slot="card-action"])': "1fr auto",
    },
  },
  title: {
    fontFamily: "var(--font-sans)",
    fontSize: {
      default: 16,
      ':is([data-slot="card"][data-size="sm"] *)': 14,
      ':is([data-slot="card"][data-size="lg"] *)': 30,
    },
    lineHeight: 1.375,
    fontWeight: {
      default: 500,
      ':is([data-slot="card"][data-size="lg"] *)': 600,
    },
  },
  description: { fontSize: 14, color: "var(--muted-foreground)" },
  action: {
    gridColumnStart: "2",
    gridRow: "span 2",
    gridRowStart: "1",
    alignSelf: "start",
    justifySelf: "end",
  },
  content: { paddingInline: "var(--card-spacing)" },
  footer: {
    display: "flex",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "var(--border)",
    backgroundColor: "color-mix(in srgb, var(--muted) 50%, transparent)",
    padding: "var(--card-spacing)",
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
});
