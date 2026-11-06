import * as React from "react";
import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./textarea.styles";
import { styles as inputStyles } from "./input.styles";

/** 提供多行输入样式，支持随内容增长和原生表单属性。 */
function Textarea({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"textarea">>) {
  return (
    <textarea
      data-slot="textarea"
      {...styleProps([inputStyles.root, styles.root, xstyle], className, style)}
      {...props}
    />
  );
}

export { Textarea };
