import type { Button as BaseButton } from "@base-ui/react/button";
import type { VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import type { buttonVariants } from "@/lib/buttonVariants";
import type { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";
import type { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import type { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type { useRender } from "@base-ui/react/use-render";
import type { CSSProperties } from "react";
import type { badgeVariants } from "@/lib/badgeVariants";

/** 基础按钮的交互属性与项目统一视觉变体。 */
export type ButtonProps = BaseButton.Props &
  VariantProps<typeof buttonVariants>;

/** 卡片保留原生容器属性；大尺寸用于独立表单，玻璃变体用于图片背景。 */
export type CardProps = ComponentProps<"div"> & {
  size?: "default" | "sm" | "lg";
  variant?: "default" | "glass";
};

/** 提示容器通过语义变体区分普通反馈和错误。 */
export type AlertProps = ComponentProps<"div"> & {
  variant?: "default" | "destructive";
};

/** 字段容器支持固定方向和基于容器宽度的响应式布局。 */
export type FieldProps = ComponentProps<"div"> & {
  orientation?: "vertical" | "horizontal" | "responsive";
};

/** 字段集合标题可以呈现为分组标题或紧凑标签。 */
export type FieldLegendProps = ComponentProps<"legend"> & {
  variant?: "legend" | "label";
};

/** 字段错误可以来自校验消息数组，也可以通过 children 直接传入。 */
export type FieldErrorProps = ComponentProps<"div"> & {
  errors?: Array<{ message?: string } | undefined>;
};

/** 输入组附加内容可排列在控件两侧或独立的上下行。 */
export type InputGroupAddonProps = ComponentProps<"div"> & {
  align?: "inline-start" | "inline-end" | "block-start" | "block-end";
};

/** 输入框内部按钮复用按钮行为，仅覆盖紧凑尺寸和原生按钮类型。 */
export type InputGroupButtonProps = Omit<ButtonProps, "size" | "type"> & {
  size?: "xs" | "sm" | "icon-xs" | "icon-sm";
  type?: "button" | "submit" | "reset";
};

/** 头像在基础可访问行为之上提供官方尺寸选项。 */
export type AvatarProps = AvatarPrimitive.Root.Props & {
  size?: "default" | "sm" | "lg";
};

/** 徽标保留 Base UI 的元素组合能力和官方视觉变体。 */
export type BadgeProps = useRender.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants>;

/** 信息条目使用官方密度和容器变体，可组合成语义链接。 */
export type ItemProps = useRender.ComponentProps<"div"> & {
  variant?: "default" | "outline" | "muted";
  size?: "default" | "sm" | "xs";
};

/** 条目媒体区域分别容纳普通内容、图标或图片。 */
export type ItemMediaProps = ComponentProps<"div"> & {
  variant?: "default" | "icon" | "image";
};

/** 空状态媒体使用默认容器或图标容器。 */
export type EmptyMediaProps = ComponentProps<"div"> & {
  variant?: "default" | "icon";
};

/** 抽屉内容保留对话框焦点管理，并选择弹出方向及关闭按钮。 */
export type SheetContentProps = SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left";
  showCloseButton?: boolean;
};

/** 提示内容组合弹层本体及定位属性。 */
export type TooltipContentProps = TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >;

/** 侧栏内部共享桌面展开、移动抽屉与统一切换操作。 */
export type SidebarContextProps = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

/** 侧栏提供器支持默认展开状态以及受控状态。 */
export type SidebarProviderProps = ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/** 侧栏容器选择方向、外观和折叠方式。 */
export type SidebarProps = ComponentProps<"div"> & {
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
};

/** 侧栏通过 CSS 自定义属性传递尺寸，不绕过样式类型检查。 */
export type SidebarCSSProperties = CSSProperties &
  Record<`--${string}`, string | number>;

/** 菜单按钮组合链接渲染、选中状态、提示及官方大小变体。 */
export type SidebarMenuButtonProps = useRender.ComponentProps<"button"> &
  ComponentProps<"button"> & {
    isActive?: boolean;
    tooltip?: string | TooltipContentProps;
    variant?: "default" | "outline";
    size?: "default" | "sm" | "lg";
  };

/** 菜单附加操作可以只在悬停或聚焦时显示。 */
export type SidebarMenuActionProps = useRender.ComponentProps<"button"> &
  ComponentProps<"button"> & { showOnHover?: boolean };

/** 菜单骨架可按实际结构预留图标位置。 */
export type SidebarMenuSkeletonProps = ComponentProps<"div"> & {
  showIcon?: boolean;
};

/** 二级菜单链接保留原生锚点语义和选中状态。 */
export type SidebarMenuSubButtonProps = useRender.ComponentProps<"a"> &
  ComponentProps<"a"> & {
    size?: "sm" | "md";
    isActive?: boolean;
  };
/** ToastIconProps 按通知语义选用图标，不根据消息内容猜测严重程度。 */
export interface ToastIconProps {
  type: string | undefined;
}
