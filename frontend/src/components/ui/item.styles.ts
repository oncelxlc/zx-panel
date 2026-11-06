import * as stylex from "@stylexjs/stylex";

/** 信息条目的容器和内容按插槽组合，保持链接和操作的原生语义。 */
export const styles = stylex.create({
  group: {
    display: "flex",
    width: "100%",
    flexDirection: "column",
    gap: {
      default: 16,
      ':has([data-size="sm"])': 10,
      ':has([data-size="xs"])': 8,
    },
  },
  separator: { marginBlock: 8 },
  root: {
    display: "flex",
    width: "100%",
    flexWrap: "wrap",
    alignItems: "center",
    borderRadius: "var(--radius-lg)",
    border: "1px solid transparent",
    borderColor: {
      default: "transparent",
      ':is([data-variant="outline"])': "var(--border)",
      ":focus-visible": "var(--ring)",
    },
    fontSize: 14,
    transitionProperty: "color, background-color",
    transitionDuration: "var(--motion-fast)",
    outline: { default: "none", ":focus-visible": "3px solid var(--ring)" },
    backgroundColor: {
      default: "transparent",
      ':is([data-variant="muted"])':
        "color-mix(in srgb, var(--muted) 50%, transparent)",
      ":is(a):hover": "var(--muted)",
    },
    gap: { default: 10, ':is([data-size="xs"])': 8 },
    paddingInline: {
      default: 12,
      ':is([data-size="xs"])': 10,
      ':is([data-slot="dropdown-menu-content"] [data-size="xs"])': 0,
    },
    paddingBlock: {
      default: 10,
      ':is([data-size="xs"])': 8,
      ':is([data-slot="dropdown-menu-content"] [data-size="xs"])': 0,
    },
  },
  media: {
    display: "flex",
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: {
      default: null,
      ':is([data-slot="item"]:has([data-slot="item-description"]) *)':
        "flex-start",
    },
    translate: {
      default: null,
      ':is([data-slot="item"]:has([data-slot="item-description"]) *)': "0 2px",
    },
    "--icon-size": "16px",
  },
  image: {
    width: {
      default: 40,
      ':is([data-size="sm"] *)': 32,
      ':is([data-size="xs"] *)': 24,
    },
    height: {
      default: 40,
      ':is([data-size="sm"] *)': 32,
      ':is([data-size="xs"] *)': 24,
    },
    overflow: "hidden",
    borderRadius: "var(--radius-sm)",
  },
  content: {
    display: "flex",
    flex: { default: 1, ':is([data-slot="item-content"] + *)': "none" },
    flexDirection: "column",
    gap: { default: 4, ':is([data-size="xs"] *)': 0 },
    minWidth: 0,
  },
  title: {
    display: "flex",
    width: "fit-content",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    lineHeight: 1.375,
    fontWeight: 500,
    textUnderlineOffset: 4,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  description: {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    textAlign: "left",
    fontSize: { default: 14, ':is([data-size="xs"] *)': 12 },
    lineHeight: 1.5,
    fontWeight: 400,
    color: "var(--muted-foreground)",
  },
  actions: { display: "flex", alignItems: "center", gap: 8 },
  edge: {
    display: "flex",
    flexBasis: "100%",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
});
