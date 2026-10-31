import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Progress } from "@/components/ui/progress";
import { useLastOpenValue } from "@/hooks/use-last-open-value";
import { LoginBackground } from "@/pages/login/LoginBackground";
import { ThemeContext } from "@/theme/themeContext";
import type { ThemeMode } from "@/types/theme.type";

it("keeps closing content and immediately replaces it on rapid reopen", () => {
  const { result, rerender } = renderHook(({ value, open }) => useLastOpenValue(value, open), {
    initialProps: { value: "task-a", open: true },
  });
  rerender({ value: "", open: false });
  expect(result.current).toBe("task-a");
  rerender({ value: "task-b", open: true });
  expect(result.current).toBe("task-b");
  rerender({ value: "", open: false });
  expect(result.current).toBe("task-b");
});

it("keeps progress geometry fixed and uses the primitive's normalized range", () => {
  const view = render(<Progress value={30} min={20} max={40} aria-label="下载" />);
  const indicator = view.container.querySelector('[data-slot="progress-indicator"]');
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "30");
  expect(indicator).toHaveStyle({ width: "100%", transform: "translateX(calc(50% - 100%))" });
  view.rerender(<Progress value={40} min={20} max={40} aria-label="下载" />);
  expect(indicator).toHaveStyle({ width: "100%", transform: "translateX(calc(100% - 100%))" });
  view.rerender(<Progress value={null} aria-label="下载" />);
  expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
  expect(indicator).toHaveStyle({ width: "100%", transform: "translateX(calc(0% - 100%))" });
});

it("reveals decoded backgrounds only and ignores an obsolete theme load", async () => {
  const images: HTMLImageElement[] = [];
  const complete: Array<() => void> = [];
  vi.stubGlobal("Image", function MockImage() {
    const image = document.createElement("img");
    image.decode = () => new Promise<void>((resolve) => complete.push(resolve));
    images.push(image);
    return image;
  });
  /** 使用真实主题上下文，只控制图片解码的完成顺序。 */
  function background(mode: ThemeMode) {
    return <ThemeContext.Provider value={{ resolvedMode: mode, preference: mode, setPreference: vi.fn(), toggleTheme: vi.fn() }}><LoginBackground /></ThemeContext.Provider>;
  }
  try {
    const view = render(background("light"));
    fireEvent.load(images[0]);
    expect(view.container.querySelector("img")).toBeNull();
    view.rerender(background("dark"));
    fireEvent.load(images[1]);
    await act(async () => complete[0]());
    expect(view.container.querySelector("img")).toBeNull();
    await act(async () => complete[1]());
    expect(view.container.querySelector("img")).toHaveAttribute("src", "/login/login-bg-dart.png");
    view.rerender(background("light"));
    fireEvent.error(images[2]);
    expect(view.container.querySelector("img")).toHaveAttribute("src", "/login/login-bg-dart.png");
    view.unmount();
  } finally {
    vi.unstubAllGlobals();
  }
});
