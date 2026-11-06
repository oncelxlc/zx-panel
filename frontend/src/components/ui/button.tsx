import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { styles, variants, sizes } from "./button.styles";
import type { ButtonProps } from "@/types/ui.type";
import { styleProps } from "@/lib/styleProps";

/** 封装 Base UI 按钮行为，统一禁用、焦点和视觉变体。 */
function Button({
  className,
  xstyle,
  style,
  variant = "default",
  size = "default",
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      {...styleProps(
        [styles.root, variants[variant], sizes[size], xstyle],
        className,
        style,
      )}
      {...props}
    />
  );
}

export { Button };
