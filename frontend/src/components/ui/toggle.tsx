import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./toggle.styles";

import type { ToggleOptions } from "@/types/ui.type";

/** Toggle 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function Toggle({
  className,
  xstyle,
  style,
  variant = "default",
  size = "default",
  ...props
}: StyledProps<TogglePrimitive.Props & ToggleOptions>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      {...styleProps(
        [
          styles.root,
          styles[size],
          variant === "outline" && styles.outline,
          xstyle,
        ],
        className,
        style,
      )}
      {...props}
    />
  );
}

export { Toggle };
