import * as stylex from "@stylexjs/stylex";

/** 分组间距为动态 StyleX 变量；零间距时只保留外侧圆角。 */
export const styles = stylex.create({
  root: {
    display: "flex",
    width: "fit-content",
    flexDirection: {
      default: "row",
      ':is([data-orientation="vertical"])': "column",
    },
    alignItems: {
      default: "center",
      ':is([data-orientation="vertical"])': "stretch",
    },
    borderRadius: "var(--radius-lg)",
  },
  spacing: (spacing: number) => ({ gap: spacing * 4 }),
  item: {
    flexShrink: 0,
    zIndex: { default: null, ":focus-visible": 10 },
    borderRadius: { default: null, ':is([data-spacing="0"])': 0 },
    borderTopLeftRadius: {
      default: null,
      ':is([data-spacing="0"]):first-child': "var(--radius-lg)",
    },
    borderTopRightRadius: {
      default: null,
      ':is([data-orientation="vertical"] [data-spacing="0"]):first-child':
        "var(--radius-lg)",
      ':is([data-orientation="horizontal"] [data-spacing="0"]):last-child':
        "var(--radius-lg)",
    },
    borderBottomLeftRadius: {
      default: null,
      ':is([data-orientation="horizontal"] [data-spacing="0"]):first-child':
        "var(--radius-lg)",
      ':is([data-orientation="vertical"] [data-spacing="0"]):last-child':
        "var(--radius-lg)",
    },
    borderBottomRightRadius: {
      default: null,
      ':is([data-spacing="0"]):last-child': "var(--radius-lg)",
    },
    marginLeft: {
      default: null,
      ':is([data-orientation="horizontal"] [data-spacing="0"][data-variant="outline"]):not(:first-child)':
        -1,
    },
    marginTop: {
      default: null,
      ':is([data-orientation="vertical"] [data-spacing="0"][data-variant="outline"]):not(:first-child)':
        -1,
    },
  },
});
