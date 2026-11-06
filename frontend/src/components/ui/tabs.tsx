import type { TabsListProps } from "@/types/ui.type";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./tabs.styles";

/** Tabs 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function Tabs({
  className,
  xstyle,
  style,
  orientation = "horizontal",
  ...props
}: StyledProps<TabsPrimitive.Root.Props>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      orientation={orientation}
      data-orientation={orientation}
      {...styleProps([styles.root, xstyle], className, style)}
      {...props}
    />
  );
}

/** TabsList 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function TabsList({
  className,
  xstyle,
  style,
  variant = "default",
  ...props
}: StyledProps<TabsListProps>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      {...styleProps([styles.list, xstyle], className, style)}
      {...props}
    />
  );
}

/** TabsTrigger 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function TabsTrigger({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<TabsPrimitive.Tab.Props>) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      {...styleProps([styles.trigger, xstyle], className, style)}
      {...props}
    />
  );
}

/** TabsContent 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function TabsContent({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<TabsPrimitive.Panel.Props>) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      {...styleProps([styles.content, xstyle], className, style)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
