import type { AvatarProps } from "@/types/ui.type";
import * as React from "react";
import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";
import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./avatar.styles";

/** 呈现头像尺寸和可访问容器，图片缺失时由回退组件补充内容。 */
function Avatar({
  className,
  xstyle,
  style,
  size = "default",
  ...props
}: StyledProps<AvatarProps>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      {...styleProps([styles.root, xstyle], className, style)}
      {...props}
    />
  );
}

/** 加载头像图片并维持容器比例。 */
function AvatarImage({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<AvatarPrimitive.Image.Props>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      {...styleProps([styles.image, xstyle], className, style)}
      {...props}
    />
  );
}

/** 在头像图片不可用时显示姓名缩写或品牌字符。 */
function AvatarFallback({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<AvatarPrimitive.Fallback.Props>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      {...styleProps([styles.fallback, xstyle], className, style)}
      {...props}
    />
  );
}

/** 为头像提供附加状态标识。 */
function AvatarBadge({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"span">>) {
  return (
    <span
      data-slot="avatar-badge"
      {...styleProps([styles.badge, xstyle], className, style)}
      {...props}
    />
  );
}

/** 按官方重叠布局展示一组头像。 */
function AvatarGroup({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="avatar-group"
      {...styleProps([styles.group, xstyle], className, style)}
      {...props}
    />
  );
}

/** 显示头像组中未展开的人数。 */
function AvatarGroupCount({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="avatar-group-count"
      {...styleProps([styles.count, xstyle], className, style)}
      {...props}
    />
  );
}

export {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarBadge,
};
