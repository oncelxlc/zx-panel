import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";
import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./separator.styles";

/** 使用 Base UI 分隔相邻内容，支持水平和垂直方向。 */
function Separator({
  className,
  xstyle,
  style,
  orientation = "horizontal",
  ...props
}: StyledProps<SeparatorPrimitive.Props>) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      {...styleProps(
        [styles.root, styles[orientation], xstyle],
        className,
        style,
      )}
      {...props}
    />
  );
}

export { Separator };
