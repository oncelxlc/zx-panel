import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { MainHeader } from "./MainHeader";
import { MainSider } from "./MainSider";
import { TaskSheet } from "@/features/panel/TaskSheet";
import { useRealtime } from "@/features/panel/realtime";

/** MainLayout 共享一条主实时流并按断点安排侧栏和内容焦点。 */
export default function MainLayout() {
  const { pathname } = useLocation();
  const realtime = useRealtime();
  const [open, setOpen] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1280px)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1280px)");
    /** 跨越桌面密度断点时同步展开状态，不在采样刷新时重置。 */
    function change() {
      setOpen(query.matches);
    }
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    document.getElementById("main-content")?.focus({ preventScroll: true });
  }, [pathname]);
  return (
    <SidebarProvider open={open} onOpenChange={setOpen}>
      <Button
        nativeButton={false}
        variant="outline"
        className="skip-link"
        render={<a href="#main-content" />}
      >
        跳转到主要内容
      </Button>
      <MainSider />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 border-b bg-background">
          <MainHeader />
        </header>
        <div id="main-content" className="panel-content" tabIndex={-1}>
          {import.meta.env.VITE_DATA_MODE === "mock" && (
            <div className="mb-4">
              <Badge variant="warning">
                演示数据 · 当前操作不会影响真实服务器
              </Badge>
            </div>
          )}
          {realtime.data?.system.observationScope !== "host" &&
            realtime.data && (
              <Alert className="mb-4">
                <AlertTitle>
                  当前观测范围：
                  {realtime.data.system.observationScope === "container"
                    ? "容器"
                    : "受限环境"}
                </AlertTitle>
                <AlertDescription>
                  仅展示实际可读取的数据，完整管理需要受支持的原生 Linux 和
                  systemd。
                </AlertDescription>
              </Alert>
            )}
          {["reconnecting", "polling"].includes(realtime.streamState) && (
            <Alert className="mb-4">
              <AlertTitle>
                {realtime.streamState === "polling"
                  ? "实时连接中断，已切换轮询"
                  : "正在恢复实时连接"}
              </AlertTitle>
              <AlertDescription>
                保留最后一次读数，采样时间决定数据是否过期。
              </AlertDescription>
            </Alert>
          )}
          <Outlet />
          <TaskSheet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
