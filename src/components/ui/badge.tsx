import type { BadgeProps } from "@/types/ui.type";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { badgeVariants } from "@/lib/badgeVariants";
import { cn } from "@/lib/utils";

/** 以官方变体展示短标签，支持与原生语义元素组合。 */
function Badge({
  className,
  variant = "default",
  render,
  ...props
}: BadgeProps) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
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
