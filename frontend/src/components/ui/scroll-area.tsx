"use client";

import * as React from "react";
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";
import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./scroll-area.styles";

/** ScrollArea 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function ScrollArea({
  className,
  xstyle,
  style,
  children,
  ...props
}: StyledProps<ScrollAreaPrimitive.Root.Props>) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      {...styleProps([styles.root, xstyle], className, style)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        {...styleProps(styles.viewport)}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

/** ScrollBar 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function ScrollBar({
  className,
  xstyle,
  style,
  orientation = "vertical",
  ...props
}: StyledProps<ScrollAreaPrimitive.Scrollbar.Props>) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      {...styleProps(
        [styles.bar, styles[orientation], xstyle],
        className,
        style,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        {...styleProps(styles.thumb)}
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}

export { ScrollArea, ScrollBar };
