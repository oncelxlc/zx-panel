import { router } from "@/routes/router";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./styles/theme.css";
import "./styles.scss";

// 入口挂载提示框与路由；路由内的 ThemeProvider 按页面决定主题策略。
ReactDOM.createRoot(document.getElementById("root") as HTMLDivElement).render(
  <StrictMode>
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>
  </StrictMode>,
);
