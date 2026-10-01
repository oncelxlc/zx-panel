import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, it, vi } from "vitest";
import { AuthGuard } from "@/auth/AuthGuard";
import { setCSRFToken } from "@/auth/session";
import {
  queryClient,
  sessionQuery,
  setupStatusQuery,
} from "@/features/panel/queries";
import { demoUser } from "@/mocks/fixtures";
import { LoginPage } from "@/pages/login/Login";

it("refreshes an inactive anonymous session before returning to the protected page", async () => {
  const anonymous = {
    authenticated: false,
    user: null,
    csrfToken: "prelogin-csrf",
    expiresAt: null,
  };
  const loggedIn = {
    user: demoUser,
    csrfToken: "session-csrf",
    expiresAt: "2026-10-02T00:00:00Z",
  };
  let authenticated = false;
  queryClient.clear();
  queryClient.setQueryData(sessionQuery.queryKey, anonymous);
  queryClient.setQueryData(setupStatusQuery.queryKey, { setupRequired: false });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      let data;
      if (input === "/api/v1/auth/login") {
        authenticated = true;
        data = loggedIn;
      } else if (input === "/api/v1/auth/session") {
        data = authenticated
          ? { authenticated: true, ...loggedIn }
          : anonymous;
      } else {
        throw new Error(`Unexpected request: ${String(input)}`);
      }
      return Response.json({
        success: true,
        data,
        error: null,
        meta: { requestId: "login-test", serverTime: "2026-10-01T00:00:00Z" },
      });
    }),
  );
  const router = createMemoryRouter(
    [
      { path: "/login", Component: LoginPage },
      {
        Component: AuthGuard,
        children: [{ path: "/overview", element: <h1>已登录概览</h1> }],
      },
    ],
    { initialEntries: ["/overview?tab=cpu#chart"] },
  );
  try {
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await screen.findByRole("heading", { name: "欢迎回来" });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("账号", { exact: true }), "admin");
    await user.type(screen.getByLabelText("密码", { exact: true }), "secret123");
    await user.click(screen.getByRole("button", { name: "登录控制台" }));
    await screen.findByRole("heading", { name: "已登录概览" });
    expect(router.state.location.pathname).toBe("/overview");
    expect(router.state.location.search).toBe("?tab=cpu");
    expect(router.state.location.hash).toBe("#chart");
  } finally {
    router.dispose();
    queryClient.clear();
    setCSRFToken("");
    vi.unstubAllGlobals();
  }
});
