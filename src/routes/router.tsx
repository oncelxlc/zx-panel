import { AuthGuard } from "@/auth/AuthGuard";
import MainLayout from "@/layouts/main/MainLayout";
import { createBrowserRouter } from "react-router";

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
