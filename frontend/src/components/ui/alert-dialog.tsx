import { styles as dialogStyles } from "./dialog.styles";
import { motion } from "@/styles/motion.styles";
import * as React from "react";
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./alert-dialog.styles";

import { Button } from "@/components/ui/button";

/** AlertDialog 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function AlertDialog({ ...props }: AlertDialogPrimitive.Root.Props) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

/** AlertDialogTrigger 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function AlertDialogTrigger({ ...props }: AlertDialogPrimitive.Trigger.Props) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  );
}

/** AlertDialogPortal 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function AlertDialogPortal({ ...props }: AlertDialogPrimitive.Portal.Props) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  );
}

/** AlertDialogOverlay 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function AlertDialogOverlay({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<AlertDialogPrimitive.Backdrop.Props>) {
  return (
    <AlertDialogPrimitive.Backdrop
      data-slot="alert-dialog-overlay"
      {...styleProps(
        [motion.overlay, dialogStyles.overlay, xstyle],
        className,
        style,
      )}
      {...props}
    />
  );
}

/** AlertDialogContent 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function AlertDialogContent({
  className,
  xstyle,
  style,
  size = "default",
  ...props
}: StyledProps<
  AlertDialogPrimitive.Popup.Props & {
    size?: "default" | "sm";
  }
>) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Popup
        data-slot="alert-dialog-content"
        data-size={size}
        {...styleProps(
          [motion.popup, dialogStyles.content, styles.content, xstyle],
          className,
          style,
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
}

/** AlertDialogHeader 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function AlertDialogHeader({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="alert-dialog-header"
      {...styleProps([styles.header, xstyle], className, style)}
      {...props}
    />
  );
}

/** AlertDialogFooter 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function AlertDialogFooter({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="alert-dialog-footer"
      {...styleProps(
        [dialogStyles.footer, styles.footer, xstyle],
        className,
        style,
      )}
      {...props}
    />
  );
}

/** AlertDialogMedia 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function AlertDialogMedia({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="alert-dialog-media"
      {...styleProps([styles.media, xstyle], className, style)}
      {...props}
    />
  );
}

/** AlertDialogTitle 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function AlertDialogTitle({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<typeof AlertDialogPrimitive.Title>>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      {...styleProps([styles.title, xstyle], className, style)}
      {...props}
    />
  );
}

/** AlertDialogDescription 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function AlertDialogDescription({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<typeof AlertDialogPrimitive.Description>>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      {...styleProps([styles.description, xstyle], className, style)}
      {...props}
    />
  );
}

/** AlertDialogAction 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function AlertDialogAction({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<typeof Button>>) {
  return (
    <Button
      data-slot="alert-dialog-action"
      xstyle={[null, xstyle]}
      className={className}
      style={style}
      {...props}
    />
  );
}

/** AlertDialogCancel 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function AlertDialogCancel({
  className,
  xstyle,
  style,
  variant = "outline",
  size = "default",
  ...props
}: StyledProps<
  AlertDialogPrimitive.Close.Props &
    Pick<React.ComponentProps<typeof Button>, "variant" | "size">
>) {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-cancel"
      {...styleProps([null, xstyle], className, style)}
      render={<Button variant={variant} size={size} />}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
