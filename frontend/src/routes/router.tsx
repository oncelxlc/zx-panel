import { ThemeProvider } from "@/theme/ThemeProvider";
import { createBrowserRouter, Navigate, Outlet } from "react-router";

/**
 * router 定义公开登录页和受 AuthGuard 保护的主布局路由。
 * 守卫、主布局和页面按路由懒加载，公开页面不提前加载后台依赖。
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
        lazy: () =>
          import("@/auth/AuthGuard").then((module) => ({
            Component: module.AuthGuard,
          })),
        children: [
          {
            path: "/",
            lazy: () =>
              import("@/layouts/main/MainLayout").then((module) => ({
                Component: module.default,
              })),
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
