import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { MainHeader } from "./MainHeader";
import { MainSider } from "./MainSider";
import { TaskSheet } from "@/features/panel/TaskSheet";
import { useRealtime } from "@/features/panel/realtime";
import { ToastNotice } from "@/features/panel/ToastNotice";

/** MainLayout 共享一条主实时流并按断点安排侧栏和内容焦点。 */
export default function MainLayout() {
  const { pathname } = useLocation();
  const realtime = useRealtime();
  const contentRef = useRef<HTMLElement>(null);
  const previousLeft = useRef<number | null>(null);
  const [open, setOpen] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1280px)").matches,
  );
  /** 切换前只读取一次视觉位置，快速反向时从当前帧继续，不逐帧测量布局。 */
  function changeSidebar(nextOpen: boolean) {
    if (nextOpen === open) return;
    previousLeft.current = contentRef.current?.getBoundingClientRect().left ?? null;
    setOpen(nextOpen);
  }
  useLayoutEffect(() => {
    const element = contentRef.current;
    const left = previousLeft.current;
    previousLeft.current = null;
    if (
      !element || left === null || typeof element.animate !== "function" ||
      typeof window.matchMedia !== "function"
    ) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;
    const delta = left - element.getBoundingClientRect().left;
    if (!delta) return;
    const style = getComputedStyle(element);
    const animation = element.animate(
      [{ transform: `translateX(${delta}px)` }, { transform: "translateX(0)" }],
      {
        duration: parseFloat(style.getPropertyValue("--motion-panel")),
        delay: open ? 0 : parseFloat(style.getPropertyValue("--motion-fast")),
        easing: style.getPropertyValue("--motion-ease").trim(),
        fill: "backwards",
      },
    );
    /** 系统要求减少动态效果时立即落到最终布局。 */
    function stopMotion() {
      if (reduced.matches) animation.cancel();
    }
    reduced.addEventListener("change", stopMotion);
    return () => {
      animation.cancel();
      reduced.removeEventListener("change", stopMotion);
    };
  }, [open]);
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
    <SidebarProvider open={open} onOpenChange={changeSidebar} className="overflow-x-clip">
      <Button
        nativeButton={false}
        variant="outline"
        className="skip-link"
        render={<a href="#main-content" />}
      >
        跳转到主要内容
      </Button>
      <MainSider />
      <SidebarInset className="min-w-0" ref={contentRef}>
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
            <ToastNotice
              id="realtime-connection"
              type="warning"
              title={
                realtime.streamState === "polling"
                  ? "实时连接中断，已切换轮询"
                  : "正在恢复实时连接"
              }
              description="保留最后一次读数，采样时间决定数据是否过期。"
            />
          )}
          <Outlet />
          <TaskSheet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
