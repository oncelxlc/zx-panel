import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { buttonVariants } from "@/lib/buttonVariants";
import type { ButtonProps } from "@/types/ui.type";
import { cn } from "@/lib/utils";

/** 封装 Base UI 按钮行为，统一禁用、焦点和视觉变体。 */
function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button };
