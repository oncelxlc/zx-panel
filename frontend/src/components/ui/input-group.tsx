import type {
  InputGroupAddonProps,
  InputGroupButtonProps,
} from "@/types/ui.type";
import type { StyledProps } from "@/types/style.type";
import * as React from "react";
import { styleProps } from "@/lib/styleProps";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { styles } from "./input-group.styles";

/** 统一输入框、图标和操作按钮的边框与聚焦状态。 */
function InputGroup({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="input-group"
      role="group"
      {...styleProps([styles.root, xstyle], className, style)}
      {...props}
    />
  );
}

/** 在输入框周围放置附加内容，点击非按钮区域时聚焦输入。 */
function InputGroupAddon({
  className,
  xstyle,
  style,
  align = "inline-start",
  ...props
}: StyledProps<InputGroupAddonProps>) {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      {...styleProps([styles.addon, styles[align], xstyle], className, style)}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("button"))
          return;
        event.currentTarget.parentElement?.querySelector("input")?.focus();
      }}
      {...props}
    />
  );
}

/** 为输入框内的操作提供按钮，默认不提交表单。 */
function InputGroupButton({
  className,
  xstyle,
  type = "button",
  variant = "ghost",
  size = "xs",
  ...props
}: InputGroupButtonProps) {
  return (
    <Button
      type={type}
      data-size={size}
      variant={variant}
      className={className}
      xstyle={[styles.button, styles[size], xstyle]}
      {...props}
    />
  );
}

/** 呈现输入框附带的单位或提示文本。 */
function InputGroupText({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"span">>) {
  return (
    <span {...styleProps([styles.text, xstyle], className, style)} {...props} />
  );
}

/** 单行输入使用所在输入组的统一边框和焦点反馈。 */
function InputGroupInput({
  xstyle,
  ...props
}: StyledProps<React.ComponentProps<"input">>) {
  return (
    <Input
      data-slot="input-group-control"
      xstyle={[styles.control, xstyle]}
      {...props}
    />
  );
}

/** 多行输入使用所在输入组的统一边框和焦点反馈。 */
function InputGroupTextarea({
  xstyle,
  ...props
}: StyledProps<React.ComponentProps<"textarea">>) {
  return (
    <Textarea
      data-slot="input-group-control"
      xstyle={[styles.control, styles.textarea, xstyle]}
      {...props}
    />
  );
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
};
