import type { AlertProps } from "@/types/ui.type";
import * as React from "react";
import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./alert.styles";

/** 呈现可被辅助技术播报的反馈，支持普通和错误状态。 */
function Alert({
  className,
  xstyle,
  style,
  variant,
  ...props
}: StyledProps<AlertProps>) {
  return (
    <div
      data-slot="alert"
      data-variant={variant ?? "default"}
      role="alert"
      {...styleProps(
        [styles.root, variant === "destructive" && styles.destructive, xstyle],
        className,
        style,
      )}
      {...props}
    />
  );
}

/** 呈现反馈标题并与提示图标对齐。 */
function AlertTitle({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="alert-title"
      {...styleProps([styles.title, xstyle], className, style)}
      {...props}
    />
  );
}

/** 容纳反馈详情和后续操作说明。 */
function AlertDescription({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="alert-description"
      {...styleProps([styles.description, xstyle], className, style)}
      {...props}
    />
  );
}

/** 将反馈的附加操作定位到容器右上角。 */
function AlertAction({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="alert-action"
      {...styleProps([styles.action, xstyle], className, style)}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription, AlertAction };
