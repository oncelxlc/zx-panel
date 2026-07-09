import MainLayout from "@/layouts/main/MainLayout";
import { createBrowserRouter } from "react-router";

export const router = createBrowserRouter([
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
]);