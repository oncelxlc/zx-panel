import MainLayout from "@/layouts/MainLayout";
import { createBrowserRouter } from "react-router";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: MainLayout,
    children: [
      {
        index: true,
        lazy: () => import("@/pages/Index/Index").then((module) => ({Component: module.IndexPage})),
      },
    ],
  },
]);