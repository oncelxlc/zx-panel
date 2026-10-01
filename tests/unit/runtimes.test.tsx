import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, expect, it } from "vitest";
import { handlers } from "@/mocks/handlers";
import { RuntimesPage, RuntimeDetailPage } from "@/pages/runtimes/Runtimes";

/** server 只返回明确的 Mock 响应，不触达真实后端或系统工具链。 */
const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

it("shows discovered versions and opens a read-only Rust installation", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([
    { path: "/runtimes", element: <RuntimesPage /> },
    { path: "/runtimes/:kind", element: <RuntimeDetailPage /> },
  ], { initialEntries: ["/runtimes"] });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  expect(await screen.findByRole("heading", { name: "Rust", exact: true })).toBeVisible();
  expect(screen.getByText("1.90.0", { exact: true })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Python", exact: true })).toBeVisible();
  await userEvent.click(screen.getAllByRole("button", { name: "查看安装" })[0]);
  expect(router.state.location.pathname).toBe("/runtimes/rust");
  expect(await screen.findByText("/usr/local/bin/rustc", { exact: true })).toBeVisible();
  expect(screen.getByText("只读", { exact: true })).toBeVisible();
  expect(screen.queryByRole("button", { name: "安装版本", exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "设为默认", exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "卸载预检", exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole("tab", { name: "可安装", exact: true })).not.toBeInTheDocument();
  client.clear();
});
