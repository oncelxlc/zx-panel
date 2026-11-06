import { iconStyles } from "@/components/ui/icon.styles";
import { styleProps } from "@/lib/styleProps";
import { styles } from "./MainSider.styles";
import { useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { CircleUserRound, LogOut } from "lucide-react";
import { logout } from "@/auth/api";
import { useAuthenticatedUser } from "@/auth/authContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useSidebar } from "@/hooks/use-sidebar";
import { queryClient } from "@/features/panel/queries";
import { navigation } from "@/features/panel/navigation";
import { toast } from "@/lib/toast";
import { ThemeToggle } from "@/theme/ThemeToggle";
import type { ThemeToggleProps } from "@/types/theme.type";

/** MainSider 提供六个本机入口，底部集中放置外观与账号图标操作。 */
export function MainSider() {
  const { pathname } = useLocation();
  const { setOpenMobile, state, isMobile } = useSidebar();
  const collapsed = !isMobile && state === "collapsed";
  const footerPopupPosition: ThemeToggleProps = {
    positionMethod: "fixed",
    side: collapsed ? "right" : "top",
    align: collapsed ? "end" : "start",
    // 折叠栏内按钮右侧还留有 12px，额外留出 8px 避开整个导航栏。
    sideOffset: collapsed ? 20 : 8,
  };
  const user = useAuthenticatedUser();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  /** 只有服务器确认会话撤销后才清理缓存并返回登录页。 */
  async function leave() {
    setLeaving(true);
    try {
      await logout();
      queryClient.clear();
      navigate("/login", { replace: true });
    } catch (error) {
      toast.add({
        title: error instanceof Error ? error.message : "退出失败，请重试",
        type: "error",
      });
    } finally {
      setLeaving(false);
    }
  }
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Item
          size="sm"
          xstyle={styles.sidebarBrand}
          className="sidebar-brand"
          render={<Link to="/overview" onClick={() => setOpenMobile(false)} />}
        >
          <ItemMedia xstyle={styles.brandMedia}>
            <Avatar>
              <AvatarImage src="/icons/android-chrome-192x192.png" alt="" />
              <AvatarFallback>zx</AvatarFallback>
            </Avatar>
          </ItemMedia>
          <ItemContent xstyle={styles.label} className="sidebar-label">
            <ItemTitle>zx-panel</ItemTitle>
            <ItemDescription>本机管理控制台</ItemDescription>
          </ItemContent>
        </Item>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu aria-label="主导航" xstyle={styles.sidebarMenu}>
              {navigation.map(({ path, label, icon: Icon }) => (
                <SidebarMenuItem key={path}>
                  <SidebarMenuButton
                    size="lg"
                    xstyle={styles.sidebarMenuButton}
                    isActive={
                      pathname === path || pathname.startsWith(path + "/")
                    }
                    tooltip={label}
                    render={
                      <NavLink to={path} onClick={() => setOpenMobile(false)} />
                    }
                  >
                    <Icon {...styleProps(iconStyles.root)} aria-hidden="true" />
                    <span
                      {...styleProps(
                        [styles.label, styles.menuLabel],
                        "sidebar-label",
                      )}
                    >
                      {label}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter xstyle={styles.footer}>
        <div {...styleProps([styles.footerMotion, styles.footerTheme])}>
          <ThemeToggle {...footerPopupPosition} />
        </div>
        <div {...styleProps([styles.footerMotion, styles.footerAccount])}>
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger
                render={
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        xstyle={styles.footerButton}
                        aria-label="账号菜单"
                      />
                    }
                  />
                }
              >
                <CircleUserRound
                  {...styleProps(iconStyles.root)}
                  aria-hidden="true"
                />
              </TooltipTrigger>
              <TooltipContent
                side={footerPopupPosition.side}
                sideOffset={footerPopupPosition.sideOffset}
              >
                账号菜单
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent
              {...footerPopupPosition}
              xstyle={styles.accountMenu}
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  {user.displayName || user.username}
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => {
                    setOpenMobile(false);
                    navigate("/settings");
                  }}
                >
                  账号与设置
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem disabled={leaving} onClick={() => void leave()}>
                  <LogOut {...styleProps(iconStyles.root)} aria-hidden="true" />
                  {leaving ? "正在退出…" : "退出登录"}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
