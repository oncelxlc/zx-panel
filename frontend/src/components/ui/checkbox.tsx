import { iconStyles } from "@/components/ui/icon.styles";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./checkbox.styles";
import { CheckIcon } from "lucide-react";

/** Checkbox 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function Checkbox({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<CheckboxPrimitive.Root.Props>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      {...styleProps([styles.root, xstyle], className, style)}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        {...styleProps(styles.indicator)}
      >
        <CheckIcon {...styleProps(iconStyles.root)} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
