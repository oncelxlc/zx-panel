import type { CardProps } from "@/types/ui.type";
import * as React from "react";
import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./card.styles";

/** 为相关内容提供统一容器；玻璃变体配合半透明主题色隔离图片背景。 */
function Card({
  className,
  xstyle,
  style,
  size = "default",
  variant = "default",
  ...props
}: StyledProps<CardProps>) {
  return (
    <div
      data-slot="card"
      data-size={size}
      data-variant={variant}
      {...styleProps(
        [styles.root, variant === "glass" && styles.glass, xstyle],
        className,
        style,
      )}
      {...props}
    />
  );
}

/** 组织卡片标题、说明与右侧操作区域。 */
function CardHeader({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="card-header"
      {...styleProps([styles.header, xstyle], className, style)}
      {...props}
    />
  );
}

/** 提供卡片标题样式，页面可在内部选择正确的标题层级。 */
function CardTitle({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="card-title"
      {...styleProps([styles.title, xstyle], className, style)}
      {...props}
    />
  );
}

/** 展示卡片辅助说明并使用次要文本颜色。 */
function CardDescription({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="card-description"
      {...styleProps([styles.description, xstyle], className, style)}
      {...props}
    />
  );
}

/** 将卡片附加操作放在标题区域右侧。 */
function CardAction({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="card-action"
      {...styleProps([styles.action, xstyle], className, style)}
      {...props}
    />
  );
}

/** 为卡片主体内容应用一致的横向留白。 */
function CardContent({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="card-content"
      {...styleProps([styles.content, xstyle], className, style)}
      {...props}
    />
  );
}

/** 组织卡片底部操作或说明并与主体分隔。 */
function CardFooter({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="card-footer"
      {...styleProps([styles.footer, xstyle], className, style)}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
