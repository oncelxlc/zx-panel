import { AuthGuard } from "@/auth/AuthGuard";
import MainLayout from "@/layouts/main/MainLayout";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { createBrowserRouter, Navigate, Outlet } from "react-router";

/**
 * router 定义公开登录页和受 AuthGuard 保护的主布局路由。
 * 页面组件使用懒加载拆分登录页与首页资源。
 */
export const router = createBrowserRouter([
  {
    element: (
      <ThemeProvider>
        <Outlet />
      </ThemeProvider>
    ),
    children: [
      {
        path: "/setup",
        lazy: () =>
          import("@/pages/setup/Setup").then((module) => ({
            Component: module.SetupPage,
          })),
      },
      {
        path: "/login",
        lazy: () =>
          import("@/pages/login/Login").then((module) => ({
            Component: module.LoginPage,
          })),
      },
      {
        Component: AuthGuard,
        children: [
          {
            path: "/",
            Component: MainLayout,
            children: [
              {
                index: true,
                element: <Navigate to="/overview" replace />,
              },
              {
                path: "overview",
                lazy: () =>
                  import("@/pages/overview/Overview").then((module) => ({
                    Component: module.OverviewPage,
                  })),
              },
              {
                path: "runtimes",
                lazy: () =>
                  import("@/pages/runtimes/Runtimes").then((module) => ({
                    Component: module.RuntimesPage,
                  })),
              },
              {
                path: "runtimes/:kind",
                lazy: () =>
                  import("@/pages/runtimes/Runtimes").then((module) => ({
                    Component: module.RuntimeDetailPage,
                  })),
              },
              {
                path: "apps",
                lazy: () =>
                  import("@/pages/apps/Apps").then((module) => ({
                    Component: module.AppsPage,
                  })),
              },
              {
                path: "apps/:appId",
                lazy: () =>
                  import("@/pages/apps/Apps").then((module) => ({
                    Component: module.AppDetailPage,
                  })),
              },
              {
                path: "monitoring",
                lazy: () =>
                  import("@/pages/monitoring/Monitoring").then((module) => ({
                    Component: module.MonitoringPage,
                  })),
              },
              {
                path: "logs",
                lazy: () =>
                  import("@/pages/logs/Logs").then((module) => ({
                    Component: module.LogsPage,
                  })),
              },
              {
                path: "settings",
                lazy: () =>
                  import("@/pages/settings/Settings").then((module) => ({
                    Component: module.SettingsPage,
                  })),
              },
              {
                path: "*",
                lazy: () =>
                  import("@/pages/NotFound").then((module) => ({
                    Component: module.NotFoundPage,
                  })),
              },
            ],
          },
        ],
      },
    ],
  },
]);
