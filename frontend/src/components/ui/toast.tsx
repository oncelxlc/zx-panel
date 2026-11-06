import { iconStyles } from "@/components/ui/icon.styles";
import { styles as spinnerStyles } from "./spinner.styles";

import * as React from "react";
import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./toast.styles";

import { Button } from "@/components/ui/button";
import {
  XIcon,
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from "lucide-react";

import { toast } from "@/lib/toast";
import type { ToastIconProps } from "@/types/ui.type";

/** ToastProvider 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function ToastProvider({ ...props }: ToastPrimitive.Provider.Props) {
  return <ToastPrimitive.Provider {...props} />;
}

/** ToastPortal 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function ToastPortal({ ...props }: ToastPrimitive.Portal.Props) {
  return <ToastPrimitive.Portal data-slot="toast-portal" {...props} />;
}

/** ToastViewport 固定在右上角并高于对话框遮罩，悬停或键盘聚焦时原生展开。 */
function ToastViewport({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<ToastPrimitive.Viewport.Props>) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      {...styleProps([styles.viewport, xstyle], className, style)}
      {...props}
    />
  );
}

/** Toast 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function Toast({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<ToastPrimitive.Root.Props>) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      {...styleProps([styles.root, xstyle], className, style)}
      {...props}
    />
  );
}

/** ToastContent 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function ToastContent({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<ToastPrimitive.Content.Props>) {
  return (
    <ToastPrimitive.Content
      data-slot="toast-content"
      {...styleProps([styles.content, xstyle], className, style)}
      {...props}
    />
  );
}

/** ToastTitle 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function ToastTitle({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<ToastPrimitive.Title.Props>) {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      {...styleProps([styles.title, xstyle], className, style)}
      {...props}
    />
  );
}

/** ToastDescription 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function ToastDescription({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<ToastPrimitive.Description.Props>) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      {...styleProps([styles.description, xstyle], className, style)}
      {...props}
    />
  );
}

/** ToastAction 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function ToastAction({
  className,
  xstyle,
  style,
  render = <Button variant="outline" size="sm" />,
  ...props
}: StyledProps<ToastPrimitive.Action.Props>) {
  return (
    <ToastPrimitive.Action
      data-slot="toast-action"
      render={render}
      {...styleProps([styles.action, xstyle], className, style)}
      {...props}
    />
  );
}

/** ToastClose 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function ToastClose({
  className,
  xstyle,
  style,
  children,
  render = <Button variant="ghost" size="icon-sm" />,
  ...props
}: StyledProps<ToastPrimitive.Close.Props>) {
  return (
    <ToastPrimitive.Close
      data-slot="toast-close"
      aria-label="关闭提示"
      render={render}
      {...styleProps([styles.close, xstyle], className, style)}
      {...props}
    >
      {children ?? (
        <XIcon {...styleProps(iconStyles.root)} aria-hidden="true" />
      )}
    </ToastPrimitive.Close>
  );
}

/** ToastIcon 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function ToastIcon({ type }: ToastIconProps) {
  let icon: React.ReactNode = null;

  if (type === "success") {
    icon = (
      <CircleCheckIcon {...styleProps(iconStyles.root)} aria-hidden="true" />
    );
  }

  if (type === "info") {
    icon = <InfoIcon {...styleProps(iconStyles.root)} aria-hidden="true" />;
  }

  if (type === "warning") {
    icon = (
      <TriangleAlertIcon {...styleProps(iconStyles.root)} aria-hidden="true" />
    );
  }

  if (type === "error") {
    icon = (
      <OctagonXIcon
        {...styleProps([iconStyles.root, styles.error])}
        aria-hidden="true"
      />
    );
  }

  if (type === "loading") {
    icon = (
      <Loader2Icon
        {...styleProps([iconStyles.root, spinnerStyles.root])}
        aria-hidden="true"
      />
    );
  }

  if (!icon) {
    return null;
  }

  return (
    <span data-slot="toast-icon" {...styleProps(styles.icon)}>
      {icon}
    </span>
  );
}

/** ToastList 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager();

  return toasts.map((toastItem, index) => (
    <Toast
      key={toastItem.id}
      toast={toastItem}
      swipeDirection={["up", "right"]}
      xstyle={[styles.layer(index), index >= 3 && styles.behind]}
    >
      <ToastContent>
        <ToastIcon type={toastItem.type} />
        <div {...styleProps(styles.text)}>
          <ToastTitle />
          <ToastDescription />
        </div>
        <ToastAction />
        <ToastClose />
      </ToastContent>
    </Toast>
  ));
}

/** Toaster 默认折叠通知，展开最多展示八条，计时与焦点由 Base UI 管理。 */
function Toaster({
  children,
  toastManager = toast,
  limit = 8,
  ...props
}: ToastPrimitive.Provider.Props) {
  return (
    <ToastProvider toastManager={toastManager} limit={limit} {...props}>
      {children}
      <ToastPortal>
        <ToastViewport>
          <ToastList />
        </ToastViewport>
      </ToastPortal>
    </ToastProvider>
  );
}

export {
  Toaster,
  Toast,
  ToastAction,
  ToastClose,
  ToastContent,
  ToastDescription,
  ToastPortal,
  ToastProvider,
  ToastTitle,
  ToastViewport,
};
