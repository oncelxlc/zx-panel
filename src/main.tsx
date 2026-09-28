import { router } from "@/routes/router";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./styles/theme.css";
import "./styles.scss";
import { ThemeProvider } from "./theme/ThemeProvider";

// 应用入口统一挂载主题上下文和浏览器路由提供器。
ReactDOM.createRoot(document.getElementById("root") as HTMLDivElement).render(
  <StrictMode>
    <ThemeProvider>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
);
