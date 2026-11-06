import { styles as toggleStyles } from "./toggle.styles";

import * as React from "react";
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./toggle-group.styles";

import type { ToggleOptions } from "@/types/ui.type";

/** ToggleGroupContext 在同一组件内共享配置与状态，避免页面重复维护交互规则。 */
const ToggleGroupContext = React.createContext<
  ToggleOptions & {
    spacing?: number;
    orientation?: "horizontal" | "vertical";
  }
>({
  size: "default",
  variant: "default",
  spacing: 2,
  orientation: "horizontal",
});

/** ToggleGroup 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function ToggleGroup({
  className,
  xstyle,
  style,
  variant,
  size,
  spacing = 2,
  orientation = "horizontal",
  children,
  ...props
}: StyledProps<
  ToggleGroupPrimitive.Props &
    ToggleOptions & {
      spacing?: number;
      orientation?: "horizontal" | "vertical";
    }
>) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      data-orientation={orientation}
      {...styleProps(
        [styles.root, styles.spacing(spacing), xstyle],
        className,
        style,
      )}
      {...props}
    >
      <ToggleGroupContext.Provider
        value={{ variant, size, spacing, orientation }}
      >
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  );
}

/** ToggleGroupItem 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function ToggleGroupItem({
  className,
  xstyle,
  style,
  children,
  variant = "default",
  size = "default",
  ...props
}: StyledProps<TogglePrimitive.Props & ToggleOptions>) {
  const context = React.useContext(ToggleGroupContext);

  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      data-spacing={context.spacing}
      {...styleProps(
        [
          toggleStyles.root,
          toggleStyles[context.size || size],
          (context.variant || variant) === "outline" && toggleStyles.outline,
          styles.item,
          xstyle,
        ],
        className,
        style,
      )}
      {...props}
    >
      {children}
    </TogglePrimitive>
  );
}

export { ToggleGroup, ToggleGroupItem };
