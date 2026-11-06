import { styleProps } from "@/lib/styleProps";
import { styles } from "./MainLayout.styles";
import { useCallback, useEffect, useState } from "react";
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
import { RuntimeAccessNotice } from "@/features/panel/RuntimeAccessNotice";
import { useThemeMode } from "@/theme/themeContext";

/** MainLayout 共享一条主实时流并按断点安排侧栏和内容焦点。 */
export default function MainLayout() {
  const { pathname } = useLocation();
  const { themeStyle } = useThemeMode();
  const islands = themeStyle === "islands";
  const realtime = useRealtime();
  const [open, setOpen] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1280px)").matches,
  );
  /** 更新展开状态，侧栏占位与外壳由同一组 CSS 过渡保持同步。 */
  const changeSidebar = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen === open) return;
      setOpen(nextOpen);
    },
    [open],
  );
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1280px)");
    let timeout: number | undefined;
    /** 跨断点后等待拖动停稳，避免临界宽度附近反复展开和收起。 */
    function change() {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        timeout = undefined;
        changeSidebar(query.matches);
      }, 160);
    }
    /** 仅延后已发生的断点变更，普通缩放不覆盖用户手动选择。 */
    function resize() {
      if (timeout !== undefined) change();
    }
    query.addEventListener("change", change);
    window.addEventListener("resize", resize);
    return () => {
      window.clearTimeout(timeout);
      query.removeEventListener("change", change);
      window.removeEventListener("resize", resize);
    };
  }, [changeSidebar]);
  useEffect(() => {
    document.getElementById("main-content")?.focus({ preventScroll: true });
  }, [pathname]);
  return (
    <SidebarProvider
      open={open}
      onOpenChange={changeSidebar}
      xstyle={styles.sidebarProvider}
    >
      <Button
        nativeButton={false}
        variant="outline"
        xstyle={styles.skipLink}
        render={<a href="#main-content" />}
      >
        跳转到主要内容
      </Button>
      <MainSider />
      <SidebarInset xstyle={styles.sidebarInset}>
        <header
          {...styleProps([
            styles.header,
            islands && styles.islandSurface,
            islands && styles.islandHeader,
          ])}
        >
          <MainHeader />
        </header>
        <div
          id="main-content"
          {...styleProps([
            styles.panelContent,
            islands && styles.islandSurface,
          ])}
          tabIndex={-1}
        >
          {import.meta.env.VITE_DATA_MODE === "mock" && (
            <div {...styleProps(styles.notice)}>
              <Badge variant="warning">
                演示数据 · 当前操作不会影响真实服务器
              </Badge>
            </div>
          )}
          {realtime.data?.system.observationScope !== "host" &&
            realtime.data && (
              <Alert xstyle={styles.notice}>
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
          <RuntimeAccessNotice />
          <Outlet />
          <TaskSheet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
