import type { ItemProps, ItemMediaProps } from "@/types/ui.type";
import * as React from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./item.styles";

import { Separator } from "@/components/ui/separator";

/** 以列表容器统一信息条目的间距。 */
function ItemGroup({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      role="list"
      data-slot="item-group"
      {...styleProps([styles.group, xstyle], className, style)}
      {...props}
    />
  );
}

/** 使用库内分隔线分开相邻条目。 */
function ItemSeparator({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<typeof Separator>>) {
  return (
    <Separator
      data-slot="item-separator"
      orientation="horizontal"
      xstyle={[styles.separator, xstyle]}
      className={className}
      style={style}
      {...props}
    />
  );
}

/** 组合媒体、标题、说明和操作，并保留渲染元素的原生语义。 */
function Item({
  className,
  xstyle,
  style,
  variant = "default",
  size = "default",
  render,
  ...props
}: StyledProps<ItemProps>) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        ...styleProps([styles.root, xstyle], className, style),
      },
      props,
    ),
    render,
    state: {
      slot: "item",
      variant,
      size,
    },
  });
}

/** 统一条目中的头像、图片或图标区域。 */
function ItemMedia({
  className,
  xstyle,
  style,
  variant = "default",
  ...props
}: StyledProps<ItemMediaProps>) {
  return (
    <div
      data-slot="item-media"
      data-variant={variant}
      {...styleProps(
        [styles.media, variant === "image" && styles.image, xstyle],
        className,
        style,
      )}
      {...props}
    />
  );
}

/** 让条目文本占用剩余空间并保持纵向排列。 */
function ItemContent({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="item-content"
      {...styleProps([styles.content, xstyle], className, style)}
      {...props}
    />
  );
}

/** 提供条目标题的统一样式和截断行为。 */
function ItemTitle({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="item-title"
      {...styleProps([styles.title, xstyle], className, style)}
      {...props}
    />
  );
}

/** 提供条目说明的次要文本样式。 */
function ItemDescription({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"p">>) {
  return (
    <p
      data-slot="item-description"
      {...styleProps([styles.description, xstyle], className, style)}
      {...props}
    />
  );
}

/** 排列条目内的操作控件。 */
function ItemActions({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="item-actions"
      {...styleProps([styles.actions, xstyle], className, style)}
      {...props}
    />
  );
}

/** 为条目提供跨越整行的头部区域。 */
function ItemHeader({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="item-header"
      {...styleProps([styles.edge, xstyle], className, style)}
      {...props}
    />
  );
}

/** 为条目提供跨越整行的尾部区域。 */
function ItemFooter({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="item-footer"
      {...styleProps([styles.edge, xstyle], className, style)}
      {...props}
    />
  );
}

export {
  Item,
  ItemMedia,
  ItemContent,
  ItemActions,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
  ItemDescription,
  ItemHeader,
  ItemFooter,
};
