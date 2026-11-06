import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { styleProps } from "@/lib/styleProps";
import { motion } from "@/styles/motion.styles";
import type { StyledProps } from "@/types/style.type";
import type { PopoverContentProps } from "@/types/ui.type";
import { styles } from "./popover.styles";

/** 沿用官方 shadcn/Base UI 弹层组合，管理打开状态和焦点恢复。 */
function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

/** 将弹层触发行为合并到已有按钮，避免嵌套交互元素。 */
function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

/** 门户面板随触发器定位；键盘导航、关闭和边缘避让交给 Base UI。 */
function PopoverContent({
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  positionMethod,
  className,
  xstyle,
  style,
  ...props
}: StyledProps<PopoverContentProps>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        positionMethod={positionMethod}
        {...styleProps(styles.positioner)}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          {...styleProps([motion.popup, styles.popup, xstyle], className, style)}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverTrigger, PopoverContent };
