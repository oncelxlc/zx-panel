import * as React from "react";
import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./label.styles";

/** 为输入控件提供可关联的可见标签。 */
function Label({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"label">>) {
  return (
    <label
      data-slot="label"
      {...styleProps([styles.root, xstyle], className, style)}
      {...props}
    />
  );
}

export { Label };
