import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MainSider } from "@/layouts/main/MainSider";
import { demoCapabilities, demoMetrics, demoSystem } from "@/mocks/fixtures";

it("keeps native sidebar link navigation through the tooltip composition", async () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(["bootstrap"], {
    system: demoSystem,
    capabilities: demoCapabilities,
    latestMetrics: demoMetrics,
    activeTasks: [],
    streamCursor: "demo:1",
    streamEpoch: "demo",
  });
  const router = createMemoryRouter(
    [
      {
        path: "*",
        element: (
          <QueryClientProvider client={client}>
            <TooltipProvider>
              <SidebarProvider>
                <MainSider />
              </SidebarProvider>
            </TooltipProvider>
          </QueryClientProvider>
        ),
      },
    ],
    { initialEntries: ["/overview"] },
  );
  render(<RouterProvider router={router} />);
  const link = screen.getByRole("link", { name: "运行时", exact: true });
  expect(link).toHaveAttribute("href", "/runtimes");
  await userEvent.click(link);
  expect(router.state.location.pathname).toBe("/runtimes");
  client.clear();
});
