import {
  SidebarInset,
  SidebarMenuButton,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { MainHeader } from "@/layouts/main/MainHeader";
import { MainSider } from "@/layouts/main/MainSider";
import { Outlet } from "react-router";

/** 使用官方 Sidebar 管理桌面侧栏和移动端抽屉，内容路由继续由 Outlet 承载。 */
export default function MainLayout() {
  return (
    <SidebarProvider>
      <SidebarMenuButton
        variant="outline"
        size="lg"
        className="skip-link w-auto"
        render={<a href="#main-content" />}
      >
        跳转到主要内容
      </SidebarMenuButton>
      <MainSider />
      <SidebarInset className="min-w-0">
        <header>
          <MainHeader />
        </header>
        <Separator />
        <section
          id="main-content"
          className="min-w-0 flex-1 p-4 md:p-8"
          tabIndex={-1}
          aria-label="页面内容"
        >
          <Outlet />
        </section>
      </SidebarInset>
    </SidebarProvider>
  );
}
