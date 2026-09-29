import { router } from "@/routes/router";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toast";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/features/panel/queries";
import "./styles/theme.css";
import "./styles.scss";

/** startApp 在渲染前选择数据模式，Mock 失败不会静默混用真实 API。 */
async function startApp() {
  if (import.meta.env.VITE_DATA_MODE === "mock") {
    const { worker } = await import("@/mocks/browser");
    await worker.start({ onUnhandledRequest: "bypass" });
  }
  const root = document.getElementById("root");
  if (!root) throw new Error("Application root is missing");
  ReactDOM.createRoot(root).render(<StrictMode><QueryClientProvider client={queryClient}><TooltipProvider><Toaster><RouterProvider router={router} /></Toaster></TooltipProvider></QueryClientProvider></StrictMode>);
}

void startApp().catch((error: unknown) => {
  const root = document.getElementById("root");
  if (root) root.textContent = "面板初始化失败，请刷新或检查开发模式配置。";
  console.error(error instanceof Error ? error.message : "Application initialization failed");
});
