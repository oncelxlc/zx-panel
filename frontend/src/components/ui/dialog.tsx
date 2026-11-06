import { iconStyles } from "@/components/ui/icon.styles";
import { motion } from "@/styles/motion.styles";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./dialog.styles";

import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

/** Dialog 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

/** DialogTrigger 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

/** DialogPortal 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

/** DialogClose 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

/** DialogOverlay 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function DialogOverlay({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<DialogPrimitive.Backdrop.Props>) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      {...styleProps(
        [motion.overlay, styles.overlay, xstyle],
        className,
        style,
      )}
      {...props}
    />
  );
}

/** DialogContent 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function DialogContent({
  className,
  xstyle,
  style,
  children,
  showCloseButton = true,
  ...props
}: StyledProps<
  DialogPrimitive.Popup.Props & {
    showCloseButton?: boolean;
  }
>) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        {...styleProps(
          [motion.popup, styles.content, xstyle],
          className,
          style,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button variant="ghost" xstyle={styles.close} size="icon-sm" />
            }
          >
            <XIcon {...styleProps(iconStyles.root)} />
            <span {...styleProps(styles.hidden)}>Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

/** DialogHeader 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function DialogHeader({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="dialog-header"
      {...styleProps([styles.header, xstyle], className, style)}
      {...props}
    />
  );
}

/** DialogFooter 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function DialogFooter({
  className,
  xstyle,
  style,
  showCloseButton = false,
  children,
  ...props
}: StyledProps<
  React.ComponentProps<"div"> & {
    showCloseButton?: boolean;
  }
>) {
  return (
    <div
      data-slot="dialog-footer"
      {...styleProps([styles.footer, xstyle], className, style)}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

/** DialogTitle 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function DialogTitle({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<DialogPrimitive.Title.Props>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      {...styleProps([styles.title, xstyle], className, style)}
      {...props}
    />
  );
}

/** DialogDescription 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function DialogDescription({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<DialogPrimitive.Description.Props>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      {...styleProps([styles.description, xstyle], className, style)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
