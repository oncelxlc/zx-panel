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
          className="sidebar-brand flex-nowrap px-2"
          render={<Link to="/overview" onClick={() => setOpenMobile(false)} />}
        >
          <ItemMedia>
            <Avatar>
              <AvatarImage src="/icons/android-chrome-192x192.png" alt="" />
              <AvatarFallback>zx</AvatarFallback>
            </Avatar>
          </ItemMedia>
          <ItemContent className="sidebar-label min-w-0">
            <ItemTitle>zx-panel</ItemTitle>
            <ItemDescription>本机管理控制台</ItemDescription>
          </ItemContent>
        </Item>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu aria-label="主导航" className="gap-2">
              {navigation.map(({ path, label, icon: Icon }) => (
                <SidebarMenuItem key={path}>
                  <SidebarMenuButton
                    size="lg"
                    className="h-10 px-4 max-lg:h-11 pointer-coarse:h-11"
                    isActive={
                      pathname === path || pathname.startsWith(path + "/")
                    }
                    tooltip={label}
                    render={
                      <NavLink to={path} onClick={() => setOpenMobile(false)} />
                    }
                  >
                    <Icon aria-hidden="true" />
                    <span className="sidebar-label shrink-0">
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
          className="sidebar-brand flex-nowrap"
        >
          <ItemMedia>
            <Server aria-hidden="true" />
          </ItemMedia>
          <ItemContent className="sidebar-label min-w-0">
            <ItemDescription>当前服务器</ItemDescription>
            <ItemTitle className="block w-full truncate" title={bootstrap.data?.system.hostname}>
              {bootstrap.data?.system.hostname || "读取本机信息…"}
            </ItemTitle>
          </ItemContent>
        </Item>
        <p className="sidebar-label whitespace-nowrap p-2 text-xs text-muted-foreground">
          zx-panel · 本机专属
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
