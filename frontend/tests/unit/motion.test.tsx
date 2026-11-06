import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Progress } from "@/components/ui/progress";
import { useLastOpenValue } from "@/hooks/use-last-open-value";
import { LoginBackground } from "@/pages/login/LoginBackground";

it("keeps closing content and immediately replaces it on rapid reopen", () => {
  const { result, rerender } = renderHook(
    ({ value, open }) => useLastOpenValue(value, open),
    {
      initialProps: { value: "task-a", open: true },
    },
  );
  rerender({ value: "", open: false });
  expect(result.current).toBe("task-a");
  rerender({ value: "task-b", open: true });
  expect(result.current).toBe("task-b");
  rerender({ value: "", open: false });
  expect(result.current).toBe("task-b");
});

it("keeps progress geometry fixed and uses the primitive's normalized range", () => {
  const view = render(
    <Progress value={30} min={20} max={40} aria-label="下载" />,
  );
  const indicator = view.container.querySelector(
    '[data-slot="progress-indicator"]',
  );
  expect(screen.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "30",
  );
  expect(indicator).toHaveStyle({ width: "100%" });
  // jsdom 不解析 CSS 变量；归一化后的位移数据由 StyleX 动态变量传递。
  expect(indicator?.getAttribute("style")).toContain(
    "translateX(calc(50% - 100%))",
  );
  view.rerender(<Progress value={40} min={20} max={40} aria-label="下载" />);
  expect(indicator).toHaveStyle({ width: "100%" });
  expect(indicator?.getAttribute("style")).toContain(
    "translateX(calc(100% - 100%))",
  );
  view.rerender(<Progress value={null} aria-label="下载" />);
  expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
  expect(indicator).toHaveStyle({ width: "100%" });
  expect(indicator?.getAttribute("style")).toContain(
    "translateX(calc(0% - 100%))",
  );
});

it("uses one decorative background and hides it if loading fails", () => {
  const view = render(<LoginBackground />);
  const image = view.container.querySelector("img");
  expect(image).toHaveAttribute("src", "/login/login-bg-lines.webp");
  expect(image).toHaveAttribute("alt", "");
  expect(image?.parentElement).toHaveAttribute("aria-hidden", "true");
  if (!image) throw new Error("Background image was not rendered");
  fireEvent.error(image);
  expect(image).not.toBeVisible();
});
