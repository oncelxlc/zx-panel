import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { handlers } from "@/mocks/handlers";
import { RuntimesPage, RuntimeDetailPage } from "@/pages/runtimes/Runtimes";
import { RuntimeAccessNotice } from "@/features/panel/RuntimeAccessNotice";
import { Toaster } from "@/components/ui/toast";
import { demoCapabilities, demoInstallations, demoMetrics, demoSystem } from "@/mocks/fixtures";

/** server 只返回明确的 Mock 响应，不触达真实后端或系统工具链。 */
const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
afterEach(() => { server.resetHandlers(); vi.useRealTimers(); });

it("opens management actions for an external installation through operation review", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([
    { path: "/runtimes", element: <RuntimesPage /> },
    { path: "/runtimes/:kind", element: <RuntimeDetailPage /> },
  ], { initialEntries: ["/runtimes"] });
  render(<QueryClientProvider client={client}><Toaster><RouterProvider router={router} /></Toaster></QueryClientProvider>);
  expect(await screen.findByRole("heading", { name: "Rust", exact: true })).toBeVisible();
  expect(screen.getByText("1.90.0", { exact: true })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Python", exact: true })).toBeVisible();
  await userEvent.click(screen.getAllByRole("button", { name: "管理安装" })[0]);
  expect(router.state.location.pathname).toBe("/runtimes/rust");
  expect(await screen.findByText("/usr/local/bin/rustc", { exact: true })).toBeVisible();
  expect(screen.queryByText("只读", { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "安装版本", exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "设为面板默认", exact: true })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "卸载预检", exact: true })).toBeVisible();
  expect(screen.queryByRole("tab", { name: "可安装", exact: true })).not.toBeInTheDocument();
  const systemDefault = screen.getByRole("button", { name: "设为系统默认", exact: true });
  await waitFor(() => expect(systemDefault).toBeEnabled());
  await userEvent.click(systemDefault);
  expect(await screen.findByText("切换 /usr/local/bin 的系统入口，影响之后通过公共 PATH 启动的程序")).toBeVisible();
  expect(screen.getByLabelText("输入 1.90.0 确认")).toBeVisible();
  client.clear();
});

it("refreshes installations while the page stays open without an event stream", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  const installed = demoInstallations.find((item) => item.kind === "go");
  if (!installed) throw new Error("Go fixture missing");
  let version = "1.25.1";
  server.use(http.get("/api/v1/runtimes/go/installations", () => HttpResponse.json({
    success: true, error: null, data: { items: [{ ...installed, version }], nextCursor: null },
    meta: { requestId: "poll-test", serverTime: "2026-11-06T00:00:00Z" },
  })));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: "/runtimes/:kind", element: <RuntimeDetailPage /> }], { initialEntries: ["/runtimes/go"] });
  const view = render(<QueryClientProvider client={client}><Toaster><RouterProvider router={router} /></Toaster></QueryClientProvider>);
  expect(await screen.findByText("1.25.1", { exact: true })).toBeVisible();
  version = "1.27.3";
  await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
  expect(await screen.findByText("1.27.3", { exact: true })).toBeVisible();
  expect(screen.queryByText("1.25.1", { exact: true })).not.toBeInTheDocument();
  view.unmount();
  client.clear();
});

it("prompts on entry and clears the restart notice after helper recovery", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const bootstrap = { system: demoSystem, capabilities: demoCapabilities, latestMetrics: demoMetrics, activeTasks: [], streamCursor: "demo:1", streamEpoch: "demo" };
  client.setQueryData(["bootstrap"], { ...bootstrap, capabilities: { ...demoCapabilities, installRuntime: { enabled: false, reasonCode: "HELPER_DISABLED", message: "请启动 helper 后重启 Go 后端" } } });
  const view = render(<QueryClientProvider client={client}><Toaster><RuntimeAccessNotice /></Toaster></QueryClientProvider>);
  await waitFor(() => expect(screen.getByRole("alertdialog", { name: "需要启用管理权限" })).toBeVisible());
  expect(screen.getByText(/sudo systemctl restart zx-panel-helper/)).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "暂时浏览" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  await userEvent.click(screen.getByRole("button", { name: "查看启动与重启步骤" }));
  await waitFor(() => expect(screen.getByRole("alertdialog")).toBeVisible());
  await userEvent.click(screen.getByRole("button", { name: "重新检查权限" }));
  await waitFor(() => expect(screen.queryByText("运行时管理权限未就绪")).not.toBeInTheDocument());
  view.unmount();
  client.clear();
});
