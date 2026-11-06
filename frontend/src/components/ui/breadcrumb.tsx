import { iconStyles } from "@/components/ui/icon.styles";
import * as React from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./breadcrumb.styles";
import { ChevronRightIcon, MoreHorizontalIcon } from "lucide-react";

/** Breadcrumb 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function Breadcrumb({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"nav">>) {
  return (
    <nav
      aria-label="breadcrumb"
      data-slot="breadcrumb"
      {...styleProps([styles.root, xstyle], className, style)}
      {...props}
    />
  );
}

/** BreadcrumbList 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function BreadcrumbList({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"ol">>) {
  return (
    <ol
      data-slot="breadcrumb-list"
      {...styleProps([styles.list, xstyle], className, style)}
      {...props}
    />
  );
}

/** BreadcrumbItem 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function BreadcrumbItem({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"li">>) {
  return (
    <li
      data-slot="breadcrumb-item"
      {...styleProps([styles.item, xstyle], className, style)}
      {...props}
    />
  );
}

/** BreadcrumbLink 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function BreadcrumbLink({
  className,
  xstyle,
  style,
  render,
  ...props
}: StyledProps<useRender.ComponentProps<"a">>) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        ...styleProps([styles.link, xstyle], className, style),
      },
      props,
    ),
    render,
    state: {
      slot: "breadcrumb-link",
    },
  });
}

/** BreadcrumbPage 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function BreadcrumbPage({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"span">>) {
  return (
    <span
      data-slot="breadcrumb-page"
      role="link"
      aria-disabled="true"
      aria-current="page"
      {...styleProps([styles.page, xstyle], className, style)}
      {...props}
    />
  );
}

/** BreadcrumbSeparator 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function BreadcrumbSeparator({
  children,
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"li">>) {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      {...styleProps([styles.separator, xstyle], className, style)}
      {...props}
    >
      {children ?? <ChevronRightIcon {...styleProps(iconStyles.root)} />}
    </li>
  );
}

/** BreadcrumbEllipsis 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function BreadcrumbEllipsis({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"span">>) {
  return (
    <span
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      aria-hidden="true"
      {...styleProps([styles.ellipsis, xstyle], className, style)}
      {...props}
    >
      <MoreHorizontalIcon {...styleProps(iconStyles.root)} />
      <span {...styleProps(styles.hidden)}>More</span>
    </span>
  );
}

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
};
