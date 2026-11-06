import { router } from "@/routes/router";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toast";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/features/panel/queries";
import { ToastNotice } from "@/features/panel/ToastNotice";
import { styleProps } from "@/lib/styleProps";
import { styles } from "./styles/theme.styles";
import "./styles/reset.css";

// 在异步 Mock 启动前应用主题，保留首屏脚本解析出的 dark 状态。
document.documentElement.classList.add(
  ...styleProps(styles.root).className.split(" "),
);
document.body.classList.add(...styleProps(styles.body).className.split(" "));

/** startApp 在渲染前选择数据模式，Mock 失败不会静默混用真实 API。 */
async function startApp() {
  if (import.meta.env.VITE_DATA_MODE === "mock") {
    const { worker } = await import("@/mocks/browser");
    await worker.start({ onUnhandledRequest: "bypass" });
  }
  const root = document.getElementById("root");
  if (!root) throw new Error("Application root is missing");
  root.classList.add(...styleProps(styles.app).className.split(" "));
  ReactDOM.createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster>
            <RouterProvider router={router} />
          </Toaster>
        </TooltipProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}

void startApp().catch((error: unknown) => {
  const root = document.getElementById("root");
  if (root) {
    ReactDOM.createRoot(root).render(
      <Toaster timeout={0}>
        <ToastNotice
          title="面板初始化失败"
          description="请刷新或检查开发模式配置。"
          type="error"
          actionLabel="刷新"
          onAction={() => window.location.reload()}
        />
      </Toaster>,
    );
  }
  console.error(
    error instanceof Error
      ? error.message
      : "Application initialization failed",
  );
});
