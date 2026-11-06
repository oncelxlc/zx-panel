import { iconStyles } from "@/components/ui/icon.styles";
import { styles as dialogStyles } from "./dialog.styles";
import type {
  SidebarProviderProps,
  SidebarProps,
  SidebarMenuButtonProps,
  SidebarMenuActionProps,
  SidebarMenuSkeletonProps,
  SidebarMenuSubButtonProps,
} from "@/types/ui.type";
import { SidebarContext, useSidebar } from "@/hooks/use-sidebar";
import type { SidebarContextProps } from "@/types/ui.type";
import * as React from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./sidebar.styles";

import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PanelLeftIcon } from "lucide-react";

/** 保存官方侧栏桌面展开偏好的键名。 */
const SIDEBAR_COOKIE_NAME = "sidebar_state";
/** 限制侧栏偏好 Cookie 的保存时间。 */
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
/** 定义侧栏组合快捷键所使用的字母。 */
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

/** 共享桌面侧栏和移动抽屉的状态，支持外部受控。 */
function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  xstyle,
  style,
  children,
  ...props
}: StyledProps<SidebarProviderProps>) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);
  // 离开窄屏后清除抽屉临时状态，避免再次缩窄时自动重开。
  if (!isMobile && openMobile) setOpenMobile(false);

  // 外部传入受控状态时优先使用该状态，否则维护内部状态。
  const [_open, _setOpen] = React.useState(defaultOpen);
  const open = openProp ?? _open;
  /** 更新受控或内部展开状态，并保存桌面偏好。 */
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value;
      if (setOpenProp) {
        setOpenProp(openState);
      } else {
        _setOpen(openState);
      }

      // 将桌面展开偏好写入官方组件约定的 Cookie。
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
    },
    [setOpenProp, open],
  );

  /** 按当前断点切换桌面侧栏或移动抽屉。 */
  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open);
  }, [isMobile, setOpen, setOpenMobile]);

  // 在卸载时移除快捷键监听，避免重复响应。
  React.useEffect(() => {
    /** 处理组件提供的侧栏快捷键。 */
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  // 通过状态属性驱动官方折叠样式。
  const state = open ? "expanded" : "collapsed";

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-wrapper"
        {...styleProps([styles.provider, xstyle], className, style)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

/** 按断点组合桌面侧栏或移动端 Sheet。 */
function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  xstyle,
  style,
  children,
  dir,
  ...props
}: StyledProps<SidebarProps>) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

  if (collapsible === "none") {
    return (
      <div
        data-slot="sidebar"
        {...styleProps([styles.fixed, xstyle], className, style)}
        {...props}
      >
        {children}
      </div>
    );
  }

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
        <SheetContent
          dir={dir}
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          xstyle={[styles.mobile, xstyle]}
          className={className}
          style={style}
          side={side}
        >
          <SheetHeader xstyle={dialogStyles.hidden}>
            <SheetTitle>主导航</SheetTitle>
            <SheetDescription>
              选择需要访问的页面，按 Escape 或关闭按钮收起导航。
            </SheetDescription>
          </SheetHeader>
          <div {...styleProps(styles.column)}>{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      {...styleProps(styles.desktop)}
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
    >
      {/* 桌面布局预留侧栏宽度 */}
      <div
        data-slot="sidebar-gap"
        {...styleProps([styles.transition, styles.gap], "sidebar-gap")}
      />
      <div
        data-slot="sidebar-container"
        data-side={side}
        {...styleProps(
          [styles.transition, styles.frame, xstyle],
          ["sidebar-frame", className].filter(Boolean).join(" "),
          style,
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          {...styleProps(styles.inner)}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** 使用标准按钮切换当前断点对应的导航状态。 */
function SidebarTrigger({
  className,
  xstyle,
  style,
  onClick,
  ...props
}: StyledProps<React.ComponentProps<typeof Button>>) {
  const { toggleSidebar, isMobile, openMobile, open } = useSidebar();

  return (
    <Button
      aria-expanded={isMobile ? openMobile : open}
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon-sm"
      xstyle={[null, xstyle]}
      className={className}
      style={style}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    >
      <PanelLeftIcon {...styleProps(iconStyles.root)} />
      <span {...styleProps(dialogStyles.hidden)}>切换导航</span>
    </Button>
  );
}

/** 提供桌面侧栏边缘的辅助折叠入口。 */
function SidebarRail({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"button">>) {
  const { toggleSidebar } = useSidebar();

  return (
    <button
      data-sidebar="rail"
      data-slot="sidebar-rail"
      aria-label="切换导航"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="切换导航"
      {...styleProps([styles.rail, xstyle], className, style)}
      {...props}
    />
  );
}

/** 为侧栏关联的主要内容提供布局容器。 */
function SidebarInset({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"main">>) {
  return (
    <main
      data-slot="sidebar-inset"
      {...styleProps([styles.inset, xstyle], className, style)}
      {...props}
    />
  );
}

/** 在侧栏中复用标准输入框。 */
function SidebarInput({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<typeof Input>>) {
  return (
    <Input
      data-slot="sidebar-input"
      data-sidebar="input"
      xstyle={[styles.input, xstyle]}
      className={className}
      style={style}
      {...props}
    />
  );
}

/** 组织侧栏顶部的品牌或工作空间内容。 */
function SidebarHeader({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      {...styleProps([styles.edge, xstyle], className, style)}
      {...props}
    />
  );
}

/** 组织侧栏底部的操作和用户信息。 */
function SidebarFooter({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      {...styleProps([styles.edge, xstyle], className, style)}
      {...props}
    />
  );
}

/** 使用主题分隔线分开侧栏区域。 */
function SidebarSeparator({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<typeof Separator>>) {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      xstyle={[styles.separator, xstyle]}
      className={className}
      style={style}
      {...props}
    />
  );
}

/** 提供可滚动的侧栏内容区域。 */
function SidebarContent({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      {...styleProps([styles.content, xstyle], className, style)}
      {...props}
    />
  );
}

/** 将相关导航项组织为一组。 */
function SidebarGroup({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      {...styleProps([styles.group, xstyle], className, style)}
      {...props}
    />
  );
}

/** 为导航分组提供可组合的标签。 */
function SidebarGroupLabel({
  className,
  xstyle,
  style,
  render,
  ...props
}: StyledProps<useRender.ComponentProps<"div"> & React.ComponentProps<"div">>) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        ...styleProps([styles.groupLabel, xstyle], className, style),
      },
      props,
    ),
    render,
    state: {
      slot: "sidebar-group-label",
      sidebar: "group-label",
    },
  });
}

/** 为导航分组提供附加操作。 */
function SidebarGroupAction({
  className,
  xstyle,
  style,
  render,
  ...props
}: StyledProps<
  useRender.ComponentProps<"button"> & React.ComponentProps<"button">
>) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        ...styleProps([styles.action, xstyle], className, style),
      },
      props,
    ),
    render,
    state: {
      slot: "sidebar-group-action",
      sidebar: "group-action",
    },
  });
}

/** 容纳分组内的菜单或其他控件。 */
function SidebarGroupContent({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      {...styleProps([styles.groupContent, xstyle], className, style)}
      {...props}
    />
  );
}

/** 用原生列表语义组织导航菜单。 */
function SidebarMenu({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"ul">>) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      {...styleProps([styles.menu, xstyle], className, style)}
      {...props}
    />
  );
}

/** 为导航项提供稳定的列表项容器。 */
function SidebarMenuItem({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"li">>) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      {...styleProps([styles.menuItem, xstyle], className, style)}
      {...props}
    />
  );
}

/** 组合导航项状态、链接元素和可选提示。 */
function SidebarMenuButton({
  render,
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  xstyle,
  style,
  ...props
}: StyledProps<SidebarMenuButtonProps>) {
  const { isMobile, state } = useSidebar();
  const comp = useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        ...styleProps(
          [styles.menuButton, variant === "outline" && styles.outline, xstyle],
          className,
          style,
        ),
      },
      props,
    ),
    render: !tooltip ? render : <TooltipTrigger render={render} />,
    state: {
      slot: "sidebar-menu-button",
      sidebar: "menu-button",
      size,
      active: isActive,
    },
  });

  if (!tooltip) {
    return comp;
  }

  if (typeof tooltip === "string") {
    tooltip = {
      children: tooltip,
    };
  }

  return (
    <Tooltip>
      {comp}
      <TooltipContent
        side="right"
        align="center"
        hidden={state !== "collapsed" || isMobile}
        {...tooltip}
      />
    </Tooltip>
  );
}

/** 提供菜单项附加操作，支持悬停时显示。 */
function SidebarMenuAction({
  className,
  xstyle,
  style,
  render,
  showOnHover = false,
  ...props
}: StyledProps<SidebarMenuActionProps>) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        ...styleProps(
          [
            styles.action,
            styles.menuAction,
            showOnHover && styles.hoverAction,
            xstyle,
          ],
          className,
          style,
        ),
      },
      props,
    ),
    render,
    state: {
      slot: "sidebar-menu-action",
      sidebar: "menu-action",
    },
  });
}

/** 展示导航项的附加短标签或计数。 */
function SidebarMenuBadge({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      {...styleProps([styles.badge, xstyle], className, style)}
      {...props}
    />
  );
}

/** 按菜单结构显示加载占位。 */
function SidebarMenuSkeleton({
  className,
  xstyle,
  style,
  showIcon = false,
  ...props
}: StyledProps<SidebarMenuSkeletonProps>) {
  // 骨架宽度仅用于展示加载占位。
  const [width] = React.useState(() => {
    return `${Math.floor(Math.random() * 40) + 50}%`;
  });

  return (
    <div
      data-slot="sidebar-menu-skeleton"
      data-sidebar="menu-skeleton"
      {...styleProps([styles.skeleton, xstyle], className, style)}
      {...props}
    >
      {showIcon && (
        <Skeleton
          xstyle={styles.skeletonIcon}
          data-sidebar="menu-skeleton-icon"
        />
      )}
      <Skeleton
        xstyle={styles.skeletonText(width)}
        data-sidebar="menu-skeleton-text"
      />
    </div>
  );
}

/** 排列带层级指示的子菜单。 */
function SidebarMenuSub({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"ul">>) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      {...styleProps([styles.sub, xstyle], className, style)}
      {...props}
    />
  );
}

/** 为子菜单提供原生列表项语义。 */
function SidebarMenuSubItem({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"li">>) {
  return (
    <li
      data-slot="sidebar-menu-sub-item"
      data-sidebar="menu-sub-item"
      {...styleProps([styles.menuItem, xstyle], className, style)}
      {...props}
    />
  );
}

/** 以原生链接语义呈现子菜单入口。 */
function SidebarMenuSubButton({
  render,
  size = "md",
  isActive = false,
  className,
  xstyle,
  style,
  ...props
}: StyledProps<SidebarMenuSubButtonProps>) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        ...styleProps(
          [styles.menuButton, styles.subButton, xstyle],
          className,
          style,
        ),
      },
      props,
    ),
    render,
    state: {
      slot: "sidebar-menu-sub-button",
      sidebar: "menu-sub-button",
      size,
      active: isActive,
    },
  });
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
};
