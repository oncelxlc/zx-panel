"use client";

import * as React from "react";
import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./table.styles";

/** Table 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function Table({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"table">>) {
  return (
    <div data-slot="table-container" {...styleProps(styles.container)}>
      <table
        data-slot="table"
        {...styleProps([styles.root, xstyle], className, style)}
        {...props}
      />
    </div>
  );
}

/** TableHeader 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function TableHeader({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"thead">>) {
  return (
    <thead
      data-slot="table-header"
      {...styleProps([styles.header, xstyle], className, style)}
      {...props}
    />
  );
}

/** TableBody 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function TableBody({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"tbody">>) {
  return (
    <tbody
      data-slot="table-body"
      {...styleProps([styles.body, xstyle], className, style)}
      {...props}
    />
  );
}

/** TableFooter 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function TableFooter({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"tfoot">>) {
  return (
    <tfoot
      data-slot="table-footer"
      {...styleProps([styles.footer, xstyle], className, style)}
      {...props}
    />
  );
}

/** TableRow 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function TableRow({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"tr">>) {
  return (
    <tr
      data-slot="table-row"
      {...styleProps([styles.row, xstyle], className, style)}
      {...props}
    />
  );
}

/** TableHead 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function TableHead({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"th">>) {
  return (
    <th
      data-slot="table-head"
      {...styleProps([styles.head, xstyle], className, style)}
      {...props}
    />
  );
}

/** TableCell 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function TableCell({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"td">>) {
  return (
    <td
      data-slot="table-cell"
      {...styleProps([styles.cell, xstyle], className, style)}
      {...props}
    />
  );
}

/** TableCaption 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function TableCaption({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"caption">>) {
  return (
    <caption
      data-slot="table-caption"
      {...styleProps([styles.caption, xstyle], className, style)}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
