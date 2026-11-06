import { motion } from "@/styles/motion.styles";
import type { TooltipContentProps } from "@/types/ui.type";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./tooltip.styles";

/** 统一子树内提示的延迟与交互管理。 */
function TooltipProvider({
  delay = 0,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      {...props}
    />
  );
}

/** 管理单个提示的打开状态。 */
function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

/** 将提示触发行为合并到已有可访问控件。 */
function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

/** 使用门户定位提示内容，避免被布局容器裁切。 */
function TooltipContent({
  className,
  xstyle,
  style,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: StyledProps<TooltipContentProps>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        {...styleProps(styles.positioner)}
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          {...styleProps(
            [motion.popup, styles.popup, xstyle],
            className,
            style,
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow {...styleProps(styles.arrow)} />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
