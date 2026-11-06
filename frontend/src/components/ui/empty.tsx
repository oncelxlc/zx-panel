import type { EmptyMediaProps } from "@/types/ui.type";
import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./empty.styles";

/** 提供空状态的统一容器和排列方式。 */
function Empty({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="empty"
      {...styleProps([styles.root, xstyle], className, style)}
      {...props}
    />
  );
}

/** 组合空状态标题、图标及说明。 */
function EmptyHeader({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="empty-header"
      {...styleProps([styles.header, xstyle], className, style)}
      {...props}
    />
  );
}

/** 为空状态配置图标或其他媒体区域。 */
function EmptyMedia({
  className,
  xstyle,
  style,
  variant = "default",
  ...props
}: StyledProps<EmptyMediaProps>) {
  return (
    <div
      data-slot="empty-icon"
      data-variant={variant}
      {...styleProps(
        [styles.media, variant === "icon" && styles.icon, xstyle],
        className,
        style,
      )}
      {...props}
    />
  );
}

/** 显示空状态标题，可通过语义属性指定标题层级。 */
function EmptyTitle({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="empty-title"
      {...styleProps([styles.title, xstyle], className, style)}
      {...props}
    />
  );
}

/** 显示空状态原因与后续操作说明。 */
function EmptyDescription({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"p">>) {
  return (
    <div
      data-slot="empty-description"
      {...styleProps([styles.description, xstyle], className, style)}
      {...props}
    />
  );
}

/** 组织空状态中的操作和补充内容。 */
function EmptyContent({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="empty-content"
      {...styleProps([styles.content, xstyle], className, style)}
      {...props}
    />
  );
}

export {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
};
