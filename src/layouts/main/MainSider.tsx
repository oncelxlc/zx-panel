import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { useSidebar } from "@/hooks/use-sidebar";
import { House } from "lucide-react";
import { Link, NavLink, useLocation } from "react-router";

/** 通过官方侧栏组合呈现真实首页入口，移动端完成导航后关闭抽屉。 */
export function MainSider() {
  const location = useLocation();
  const { setOpenMobile } = useSidebar();
  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <Item
          size="sm"
          render={<Link to="/" onClick={() => setOpenMobile(false)} />}
        >
          <ItemMedia>
            <Avatar aria-hidden="true">
              <AvatarFallback>Z</AvatarFallback>
            </Avatar>
          </ItemMedia>
          <ItemContent>
            <ItemTitle>ZX PANEL</ItemTitle>
          </ItemContent>
        </Item>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>工作空间</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu aria-label="主导航">
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="lg"
                  isActive={location.pathname === "/"}
                  render={
                    <NavLink to="/" end onClick={() => setOpenMobile(false)} />
                  }
                >
                  <House aria-hidden="true" />
                  <span>首页</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
