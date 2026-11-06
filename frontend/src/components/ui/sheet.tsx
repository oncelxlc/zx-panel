import { iconStyles } from "@/components/ui/icon.styles";
import { styles as dialogStyles } from "./dialog.styles";
import { motion } from "@/styles/motion.styles";
import type { SheetContentProps } from "@/types/ui.type";
import * as React from "react";
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./sheet.styles";

import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

/** 通过 Base UI 对话框管理抽屉状态和焦点。 */
function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

/** 为既有控件添加抽屉打开行为。 */
function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

/** 提供可组合的抽屉关闭行为。 */
function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

/** 将抽屉渲染到门户层。 */
function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

/** 为打开的抽屉提供背景遮罩。 */
function SheetOverlay({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<SheetPrimitive.Backdrop.Props>) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      {...styleProps(
        [motion.overlay, dialogStyles.overlay, xstyle],
        className,
        style,
      )}
      {...props}
    />
  );
}

/** 组合抽屉内容、遮罩和可访问关闭入口。 */
function SheetContent({
  className,
  xstyle,
  style,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: StyledProps<SheetContentProps>) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        {...styleProps(
          [motion.sheet, styles.content, styles[side], xstyle],
          className,
          style,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={
              <Button variant="ghost" xstyle={styles.close} size="icon-sm" />
            }
          >
            <XIcon {...styleProps(iconStyles.root)} />
            <span {...styleProps(dialogStyles.hidden)}>关闭</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  );
}

/** 组织抽屉标题与说明。 */
function SheetHeader({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="sheet-header"
      {...styleProps([styles.header, xstyle], className, style)}
      {...props}
    />
  );
}

/** 排列抽屉底部操作。 */
function SheetFooter({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="sheet-footer"
      {...styleProps([styles.footer, xstyle], className, style)}
      {...props}
    />
  );
}

/** 为抽屉提供辅助技术可识别的名称。 */
function SheetTitle({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<SheetPrimitive.Title.Props>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      {...styleProps([styles.title, xstyle], className, style)}
      {...props}
    />
  );
}

/** 为抽屉提供辅助技术可读取的用途说明。 */
function SheetDescription({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<SheetPrimitive.Description.Props>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      {...styleProps([styles.description, xstyle], className, style)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
