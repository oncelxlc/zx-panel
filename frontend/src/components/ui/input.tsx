import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./input.styles";

/** 封装基础输入控件，保留原生表单属性与焦点行为。 */
function Input({
  className,
  xstyle,
  style,
  type,
  ...props
}: StyledProps<React.ComponentProps<"input">>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      {...styleProps([styles.root, xstyle], className, style)}
      {...props}
    />
  );
}

export { Input };
