import { StrictMode } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/toast";
import { ToastNotice } from "@/features/panel/ToastNotice";
import { QueryState } from "@/features/panel/Shared";
import { ApiError } from "@/lib/api/client";
import { createToastManager } from "@/lib/toast";

it("shows at most eight notifications and expands on keyboard focus", async () => {
  const manager = createToastManager();
  render(<Toaster toastManager={manager} timeout={0} />);
  act(() => {
    for (let index = 1; index <= 10; index++) {
      manager.add({ title: `通知 ${index}` });
    }
  });
  const viewport = document.querySelector('[data-slot="toast-viewport"]');
  expect(viewport).not.toHaveAttribute("data-expanded");
  expect(document.querySelectorAll('[data-slot="toast"]:not([data-limited])')).toHaveLength(8);
  expect(document.querySelectorAll('[data-slot="toast"][data-limited][inert]')).toHaveLength(2);
  await userEvent.tab();
  expect(viewport).toHaveAttribute("data-expanded");
});

it("keeps a single notice in StrictMode, uses the latest action and respects dismissal", async () => {
  const firstAction = vi.fn();
  const nextAction = vi.fn();
  const view = render(
    <StrictMode>
      <Toaster timeout={0}>
        <ToastNotice id="warning" title="连接中断" type="warning" actionLabel="重试" onAction={firstAction} />
      </Toaster>
    </StrictMode>,
  );
  await screen.findByText("连接中断");
  view.rerender(
    <StrictMode>
      <Toaster timeout={0}>
        <ToastNotice id="warning" title="连接中断" type="warning" actionLabel="重试" onAction={nextAction} />
      </Toaster>
    </StrictMode>,
  );
  expect(document.querySelectorAll('[data-slot="toast"]')).toHaveLength(1);
  await userEvent.click(screen.getByRole("button", { name: "重试" }));
  expect(firstAction).not.toHaveBeenCalled();
  expect(nextAction).toHaveBeenCalledOnce();
  await userEvent.click(screen.getByRole("button", { name: "关闭提示" }));
  await waitFor(() => expect(screen.queryByText("连接中断")).not.toBeInTheDocument());
  view.rerender(
    <StrictMode>
      <Toaster timeout={0}>
        <ToastNotice id="warning" title="连接中断" type="warning" actionLabel="重试" onAction={() => nextAction()} />
      </Toaster>
    </StrictMode>,
  );
  expect(screen.queryByText("连接中断")).not.toBeInTheDocument();
  view.rerender(<Toaster timeout={0}><ToastNotice title="已切换轮询" type="warning" /></Toaster>);
  await screen.findByText("已切换轮询");
});

it("reports shared errors once, keeps request IDs and preserves required local retry", async () => {
  const error = new ApiError(503, "UNAVAILABLE", "面板暂不可用", "request-123");
  const retry = vi.fn();
  const view = render(<Toaster timeout={0}><QueryState error={error} /><QueryState error={error} /></Toaster>);
  expect(document.querySelectorAll('[data-slot="toast"]')).toHaveLength(1);
  expect(screen.getByText("请求编号：request-123")).toBeVisible();
  expect(view.container.querySelector('[data-slot="alert"]')).toBeNull();
  view.rerender(<Toaster timeout={0}><QueryState error={error} retry={retry} /></Toaster>);
  const localError = screen.getByRole("alert");
  expect(within(localError).getByText("请求编号：request-123")).toBeVisible();
  await userEvent.click(within(localError).getByRole("button", { name: "重试" }));
  expect(retry).toHaveBeenCalledOnce();
});
