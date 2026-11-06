import type { BadgeProps } from "@/types/ui.type";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";

import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./badge.styles";

/** 以官方变体展示短标签，支持与原生语义元素组合。 */
function Badge({
  className,
  xstyle,
  style,
  variant = "default",
  render,
  ...props
}: StyledProps<BadgeProps>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        ...styleProps([styles.root, styles[variant], xstyle], className, style),
      },
      props,
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  });
}

export { Badge };
