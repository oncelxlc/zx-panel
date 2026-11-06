import { iconStyles } from "@/components/ui/icon.styles";
import { motion } from "@/styles/motion.styles";
import * as React from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./select.styles";
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from "lucide-react";

/** Select 在同一组件内共享配置与状态，避免页面重复维护交互规则。 */
const Select = SelectPrimitive.Root;

/** SelectGroup 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function SelectGroup({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<SelectPrimitive.Group.Props>) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      {...styleProps([styles.group, xstyle], className, style)}
      {...props}
    />
  );
}

/** SelectValue 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function SelectValue({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<SelectPrimitive.Value.Props>) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      {...styleProps([styles.value, xstyle], className, style)}
      {...props}
    />
  );
}

/** SelectTrigger 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function SelectTrigger({
  className,
  xstyle,
  style,
  size = "default",
  children,
  ...props
}: StyledProps<
  SelectPrimitive.Trigger.Props & {
    size?: "sm" | "default";
  }
>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      {...styleProps([styles.trigger, xstyle], className, style)}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <ChevronDownIcon {...styleProps([iconStyles.root, styles.icon])} />
        }
      />
    </SelectPrimitive.Trigger>
  );
}

/** SelectContent 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function SelectContent({
  className,
  xstyle,
  style,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...props
}: StyledProps<
  SelectPrimitive.Popup.Props &
    Pick<
      SelectPrimitive.Positioner.Props,
      "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
    >
>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        {...styleProps(styles.positioner)}
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          {...styleProps(
            [motion.popup, styles.popup, xstyle],
            className,
            style,
          )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

/** SelectLabel 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function SelectLabel({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<SelectPrimitive.GroupLabel.Props>) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      {...styleProps([styles.label, xstyle], className, style)}
      {...props}
    />
  );
}

/** SelectItem 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function SelectItem({
  className,
  xstyle,
  style,
  children,
  ...props
}: StyledProps<SelectPrimitive.Item.Props>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      {...styleProps([styles.item, xstyle], className, style)}
      {...props}
    >
      <SelectPrimitive.ItemText {...styleProps(styles.itemText)}>
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={<span {...styleProps(styles.indicator)} />}
      >
        <CheckIcon {...styleProps([iconStyles.root, styles.passiveIcon])} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

/** SelectSeparator 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function SelectSeparator({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<SelectPrimitive.Separator.Props>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      {...styleProps([styles.separator, xstyle], className, style)}
      {...props}
    />
  );
}

/** SelectScrollUpButton 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function SelectScrollUpButton({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      {...styleProps([styles.scroll, styles.up, xstyle], className, style)}
      {...props}
    >
      <ChevronUpIcon {...styleProps(iconStyles.root)} />
    </SelectPrimitive.ScrollUpArrow>
  );
}

/** SelectScrollDownButton 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function SelectScrollDownButton({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      {...styleProps([styles.scroll, styles.down, xstyle], className, style)}
      {...props}
    >
      <ChevronDownIcon {...styleProps(iconStyles.root)} />
    </SelectPrimitive.ScrollDownArrow>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
