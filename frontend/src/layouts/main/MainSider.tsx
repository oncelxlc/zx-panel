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
          render={<Link to="/overview" onClick={() => setOpenMobile(false)} />}
        >
          <ItemMedia>
            <Avatar>
              <AvatarImage src="/icons/android-chrome-192x192.png" alt="" />
              <AvatarFallback>zx</AvatarFallback>
            </Avatar>
          </ItemMedia>
          <ItemContent className="group-data-[collapsible=icon]:hidden">
            <ItemTitle>zx-panel</ItemTitle>
            <ItemDescription>本机管理控制台</ItemDescription>
          </ItemContent>
        </Item>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu aria-label="主导航">
              {navigation.map(({ path, label, icon: Icon }) => (
                <SidebarMenuItem key={path}>
                  <SidebarMenuButton
                    size="lg"
                    isActive={
                      pathname === path || pathname.startsWith(path + "/")
                    }
                    tooltip={label}
                    render={
                      <NavLink to={path} onClick={() => setOpenMobile(false)} />
                    }
                  >
                    <Icon aria-hidden="true" />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <Item variant="outline" size="sm">
          <ItemMedia>
            <Server aria-hidden="true" />
          </ItemMedia>
          <ItemContent className="group-data-[collapsible=icon]:hidden">
            <ItemDescription>当前服务器</ItemDescription>
            <ItemTitle>
              {bootstrap.data?.system.hostname || "读取本机信息…"}
            </ItemTitle>
          </ItemContent>
        </Item>
        <p className="p-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          zx-panel · 本机专属
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
