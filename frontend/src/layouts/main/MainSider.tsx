import { iconStyles } from "@/components/ui/icon.styles";
import { styleProps } from "@/lib/styleProps";
import { styles } from "./MainSider.styles";
import { Link, NavLink, useLocation } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Server } from "lucide-react";
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
import { bootstrapQuery } from "@/features/panel/queries";
import { navigation } from "@/features/panel/navigation";

/** MainSider 只呈现六个本机入口，没有主机切换或范围外菜单。 */
export function MainSider() {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  const bootstrap = useQuery(bootstrapQuery);
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
          <ItemContent xstyle={styles.sidebarLabel} className="sidebar-label">
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
                    <span {...styleProps(styles.menuLabel, "sidebar-label")}>
                      {label}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <Item
          variant="outline"
          size="sm"
          xstyle={styles.serverBrand}
          className="sidebar-brand"
        >
          <ItemMedia xstyle={styles.brandMedia}>
            <Server {...styleProps(iconStyles.root)} aria-hidden="true" />
          </ItemMedia>
          <ItemContent xstyle={styles.sidebarLabel} className="sidebar-label">
            <ItemDescription>当前服务器</ItemDescription>
            <ItemTitle
              xstyle={styles.serverName}
              title={bootstrap.data?.system.hostname}
            >
              {bootstrap.data?.system.hostname || "读取本机信息…"}
            </ItemTitle>
          </ItemContent>
        </Item>
        <p {...styleProps(styles.footerLabel, "sidebar-label")}>
          zx-panel · 本机专属
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
