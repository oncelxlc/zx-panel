import { iconStyles } from "@/components/ui/icon.styles";
import { motion } from "@/styles/motion.styles";

import * as React from "react";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./dropdown-menu.styles";
import { ChevronRightIcon, CheckIcon } from "lucide-react";

/** DropdownMenu 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

/** DropdownMenuPortal 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function DropdownMenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
  return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}

/** DropdownMenuTrigger 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

/** DropdownMenuContent 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function DropdownMenuContent({
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  positionMethod,
  className,
  xstyle,
  style,
  ...props
}: StyledProps<
  MenuPrimitive.Popup.Props &
    Pick<
      MenuPrimitive.Positioner.Props,
      "align" | "alignOffset" | "side" | "sideOffset" | "positionMethod"
    >
>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        {...styleProps(styles.positioner)}
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        positionMethod={positionMethod}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          {...styleProps(
            [motion.popup, styles.popup, xstyle],
            className,
            style,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

/** DropdownMenuGroup 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function DropdownMenuGroup({ ...props }: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

/** DropdownMenuLabel 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function DropdownMenuLabel({
  className,
  xstyle,
  style,
  inset,
  ...props
}: StyledProps<
  MenuPrimitive.GroupLabel.Props & {
    inset?: boolean;
  }
>) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      data-inset={inset}
      {...styleProps([styles.label, xstyle], className, style)}
      {...props}
    />
  );
}

/** DropdownMenuItem 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function DropdownMenuItem({
  className,
  xstyle,
  style,
  inset,
  variant = "default",
  ...props
}: StyledProps<
  MenuPrimitive.Item.Props & {
    inset?: boolean;
    variant?: "default" | "destructive";
  }
>) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      {...styleProps([styles.item, xstyle], className, style)}
      {...props}
    />
  );
}

/** DropdownMenuSub 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function DropdownMenuSub({ ...props }: MenuPrimitive.SubmenuRoot.Props) {
  return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />;
}

/** DropdownMenuSubTrigger 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function DropdownMenuSubTrigger({
  className,
  xstyle,
  style,
  inset,
  children,
  ...props
}: StyledProps<
  MenuPrimitive.SubmenuTrigger.Props & {
    inset?: boolean;
  }
>) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      {...styleProps([styles.item, xstyle], className, style)}
      {...props}
    >
      {children}
      <ChevronRightIcon {...styleProps([iconStyles.root, styles.chevron])} />
    </MenuPrimitive.SubmenuTrigger>
  );
}

/** DropdownMenuSubContent 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function DropdownMenuSubContent({
  align = "start",
  alignOffset = -3,
  side = "right",
  sideOffset = 0,
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<typeof DropdownMenuContent>>) {
  return (
    <DropdownMenuContent
      data-slot="dropdown-menu-sub-content"
      xstyle={[styles.subPopup, xstyle]}
      className={className}
      style={style}
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  );
}

/** DropdownMenuCheckboxItem 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function DropdownMenuCheckboxItem({
  className,
  xstyle,
  style,
  children,
  checked,
  inset,
  ...props
}: StyledProps<
  MenuPrimitive.CheckboxItem.Props & {
    inset?: boolean;
  }
>) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      {...styleProps([styles.item, styles.choice, xstyle], className, style)}
      checked={checked}
      {...props}
    >
      <span
        {...styleProps(styles.indicator)}
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <MenuPrimitive.CheckboxItemIndicator>
          <CheckIcon {...styleProps(iconStyles.root)} />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
}

/** DropdownMenuRadioGroup 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function DropdownMenuRadioGroup({ ...props }: MenuPrimitive.RadioGroup.Props) {
  return (
    <MenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  );
}

/** DropdownMenuRadioItem 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function DropdownMenuRadioItem({
  className,
  xstyle,
  style,
  children,
  inset,
  ...props
}: StyledProps<
  MenuPrimitive.RadioItem.Props & {
    inset?: boolean;
  }
>) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      {...styleProps([styles.item, styles.choice, xstyle], className, style)}
      {...props}
    >
      <span
        {...styleProps(styles.indicator)}
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <MenuPrimitive.RadioItemIndicator>
          <CheckIcon {...styleProps(iconStyles.root)} />
        </MenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  );
}

/** DropdownMenuSeparator 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function DropdownMenuSeparator({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<MenuPrimitive.Separator.Props>) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      {...styleProps([styles.separator, xstyle], className, style)}
      {...props}
    />
  );
}

/** DropdownMenuShortcut 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function DropdownMenuShortcut({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"span">>) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      {...styleProps([styles.shortcut, xstyle], className, style)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};
