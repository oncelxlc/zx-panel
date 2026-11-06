import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./skeleton.styles";

/** 使用语义背景和官方动画表达内容正在加载。 */
function Skeleton({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="skeleton"
      {...styleProps([styles.root, xstyle], className, style)}
      {...props}
    />
  );
}

export { Skeleton };
