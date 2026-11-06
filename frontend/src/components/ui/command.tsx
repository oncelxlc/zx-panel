import { iconStyles } from "@/components/ui/icon.styles";
import { styles as dialogStyles } from "./dialog.styles";

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./command.styles";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import { SearchIcon, CheckIcon } from "lucide-react";

/** Command 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function Command({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<typeof CommandPrimitive>>) {
  return (
    <CommandPrimitive
      data-slot="command"
      {...styleProps([styles.root, xstyle], className, style)}
      {...props}
    />
  );
}

/** CommandDialog 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  xstyle,
  style,
  showCloseButton = false,
  ...props
}: StyledProps<
  Omit<React.ComponentProps<typeof Dialog>, "children"> & {
    title?: string;
    description?: string;
    style?: React.CSSProperties;
    className?: string;
    showCloseButton?: boolean;
    children: React.ReactNode;
  }
>) {
  return (
    <Dialog {...props}>
      <DialogContent
        xstyle={[styles.dialog, xstyle]}
        className={className}
        style={style}
        showCloseButton={showCloseButton}
      >
        <DialogHeader xstyle={dialogStyles.hidden}>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** CommandInput 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function CommandInput({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<typeof CommandPrimitive.Input>>) {
  return (
    <div data-slot="command-input-wrapper" {...styleProps(styles.wrapper)}>
      <InputGroup xstyle={styles.inputGroup}>
        <CommandPrimitive.Input
          data-slot="command-input"
          {...styleProps([styles.input, xstyle], className, style)}
          {...props}
        />
        <InputGroupAddon xstyle={styles.addon}>
          <SearchIcon {...styleProps([iconStyles.root, styles.search])} />
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}

/** CommandList 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function CommandList({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<typeof CommandPrimitive.List>>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      {...styleProps([styles.list, xstyle], className, style)}
      {...props}
    />
  );
}

/** CommandEmpty 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function CommandEmpty({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<typeof CommandPrimitive.Empty>>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      {...styleProps([styles.empty, xstyle], className, style)}
      {...props}
    />
  );
}

/** CommandGroup 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function CommandGroup({
  className,
  xstyle,
  style,
  heading,
  ...props
}: StyledProps<React.ComponentProps<typeof CommandPrimitive.Group>>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      heading={
        heading ? (
          <span {...styleProps(styles.heading)}>{heading}</span>
        ) : undefined
      }
      {...styleProps([styles.group, xstyle], className, style)}
      {...props}
    />
  );
}

/** CommandSeparator 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function CommandSeparator({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<typeof CommandPrimitive.Separator>>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      {...styleProps([styles.separator, xstyle], className, style)}
      {...props}
    />
  );
}

/** CommandItem 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function CommandItem({
  className,
  xstyle,
  style,
  children,
  ...props
}: StyledProps<React.ComponentProps<typeof CommandPrimitive.Item>>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      {...styleProps([styles.item, xstyle], className, style)}
      {...props}
    >
      {children}
      <CheckIcon {...styleProps([iconStyles.root, styles.check])} />
    </CommandPrimitive.Item>
  );
}

/** CommandShortcut 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function CommandShortcut({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"span">>) {
  return (
    <span
      data-slot="command-shortcut"
      {...styleProps([styles.shortcut, xstyle], className, style)}
      {...props}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
