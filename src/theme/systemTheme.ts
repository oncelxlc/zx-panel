import type { ThemeMode } from "@/types/theme.type";

/** 登录页始终跟随系统；匹配路由允许的大小写和末尾斜杠。 */
export function isSystemThemePath(pathname: string): boolean {
  return /^\/(?:login|setup)\/*$/i.test(pathname);
}

/** 仅在系统明确偏好亮色时启用亮色；SSR 和不支持媒体查询时默认暗色。 */
export function getSystemTheme(): ThemeMode {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

/** 同步根节点主题；跳过首屏动画，后续变化使用可取消的原生淡入淡出。 */
export function syncDocumentTheme(mode: ThemeMode) {
  if (
    typeof document === "undefined" ||
    document.documentElement.dataset.theme === mode
  ) {
    return;
  }

  let cancelled = false;

  /** 在截图完成后更新主题；快速切换或卸载时禁止过期回调覆盖最新主题。 */
  function updateTheme() {
    if (cancelled) return;
    const root = document.documentElement;
    root.dataset.theme = mode;
    root.classList.toggle("dark", mode === "dark");
  }

  if (
    typeof document.startViewTransition !== "function" ||
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    document.visibilityState === "hidden"
  ) {
    updateTheme();
    return;
  }

  const transition = document.startViewTransition(updateTheme);
  void transition.ready.catch(() => {
    // 取消动画或页面不可见会拒绝 ready；主题仍由更新回调同步。
  });

  return () => {
    cancelled = true;
    transition.skipTransition();
  };
}
