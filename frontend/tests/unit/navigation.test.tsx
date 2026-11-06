import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MainSider } from "@/layouts/main/MainSider";
import { demoUser } from "@/mocks/fixtures";
import { AuthUserContext } from "@/auth/authContext";
import { ThemeProvider } from "@/theme/ThemeProvider";

it("keeps native sidebar link navigation through the tooltip composition", async () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  const router = createMemoryRouter(
    [
      {
        path: "*",
        element: (
          <ThemeProvider>
            <AuthUserContext.Provider value={demoUser}>
              <TooltipProvider>
                <SidebarProvider>
                  <MainSider />
                </SidebarProvider>
              </TooltipProvider>
            </AuthUserContext.Provider>
          </ThemeProvider>
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
});
