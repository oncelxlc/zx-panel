"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./switch.styles";

/** Switch 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function Switch({
  className,
  xstyle,
  style,
  size = "default",
  ...props
}: StyledProps<
  SwitchPrimitive.Root.Props & {
    size?: "sm" | "default";
  }
>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      {...styleProps([styles.root, xstyle], className, style)}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        {...styleProps(styles.thumb)}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
