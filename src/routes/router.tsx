import { AuthGuard } from "@/auth/AuthGuard";
import MainLayout from "@/layouts/main/MainLayout";
import { createBrowserRouter } from "react-router";

/**
 * router 定义公开登录页和受 AuthGuard 保护的主布局路由。
 * 页面组件使用懒加载拆分登录页与首页资源。
 */
export const router = createBrowserRouter([
  {
    path: "/login",
    lazy: () => import("@/pages/login/Login").then((module) => ({Component: module.LoginPage})),
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
            lazy: () => import("@/pages/index/Index").then((module) => ({Component: module.IndexPage})),
          },
        ],
      },
    ],
  },
]);
