import { Button } from "antd";
import type { RouteContent, RoutePath } from "@/types/navigation.type";
import type { MouseEvent } from "react";
import { useEffect, useState } from "react";
import { useThemeMode } from "./theme/themeContext";

/**
 * routes 保存旧版兼容页面的静态路径与展示内容。
 * 当前正式入口使用 React Router，该列表仅供保留页面复用。
 */
const routes: RouteContent[] = [
  {
    path: "/",
    eyebrow: "ZX Panel",
    title: "Vite + React front-end scaffold",
    description:
      "当前前端已移除 Next.js App Router，改为更直接的 Vite 单页入口。",
    details: [
      "构建工具切换为 Vite，开发启动更轻量。",
      "保留原有路径语义，避免现有页面含义完全丢失。",
      "页面分发基于 pathname，可按需要再接入正式路由方案。",
    ],
  },
  {
    path: "/nginx",
    eyebrow: "Nginx",
    title: "Welcome to Nginx0!",
    description: "这是原 `/nginx` 页面迁移后的 React 版本。",
    details: [
      "原有页面文案已保留。",
      "该视图现在由 Vite 前端统一接管。",
      "后续可在这里继续扩展 nginx 管理面板。",
    ],
  },
  {
    path: "/nginx/index",
    eyebrow: "Nginx Index",
    title: "Welcome to Nginx1!",
    description: "这是原 `/nginx/index` 页面迁移后的 React 版本。",
    details: [
      "保持了原始页面语义。",
      "与 `/nginx` 共用同一个客户端入口。",
      "如需复杂路由，可后续再引入正式路由库。",
    ],
  },
];

/**
 * normalizePath 统一浏览器路径格式并移除非根路径末尾斜杠。
 * 空路径会回退到根路径，保证后续匹配具有稳定输入。
 */
function normalizePath(pathname: string) {
  if (!pathname) {
    return "/";
  }

  if (pathname !== "/" && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

/**
 * getRoute 根据规范化路径查找旧版页面配置。
 * 未找到时返回 undefined，由页面渲染 404 内容。
 */
function getRoute(pathname: string) {
  return routes.find((route) => route.path === pathname);
}

/**
 * useCurrentPath 订阅浏览器历史变化并维护当前路径。
 * Hook 同时向旧版页面暴露主动更新路径的能力。
 */
function useCurrentPath() {
  const [currentPath, setCurrentPath] = useState("/");

  useEffect(() => {
    // 浏览器前进后退时重新同步规范化路径。
    const syncPath = () => {
      setCurrentPath(normalizePath(window.location.pathname));
    };

    syncPath();
    window.addEventListener("popstate", syncPath);

    return () => {
      window.removeEventListener("popstate", syncPath);
    };
  }, []);

  return { currentPath, setCurrentPath };
}

/**
 * App 渲染保留的手动路径分发页面。
 * 组件当前不作为正式入口，但继续保持可编译和可维护状态。
 */
export default function App() {
  const { currentPath, setCurrentPath } = useCurrentPath();
  const { resolvedMode, toggleTheme } = useThemeMode();
  const activeRoute = getRoute(currentPath);

  // 仅拦截普通左键导航，保留浏览器新窗口和修饰键行为。
  const handleNavigate = (
    event: MouseEvent<HTMLAnchorElement>,
    path: RoutePath,
  ) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();

    const nextPath = normalizePath(path);
    if (nextPath === currentPath) {
      return;
    }

    // 同步浏览器历史与组件状态，避免触发整页刷新。
    window.history.pushState({}, "", nextPath);
    setCurrentPath(nextPath);
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <p className="sidebar__eyebrow">ZX PANEL</p>
        <h1 className="sidebar__title">Frontend Workspace</h1>
        <p className="sidebar__description">
          使用 Vite 管理单页应用入口，当前按路径渲染原有三个页面。
        </p>
        <div className="theme-actions">
          <Button type="primary">Button</Button>
          <Button onClick={toggleTheme}>
            {resolvedMode === "dark" ? "切换亮色" : "切换暗色"}
          </Button>
        </div>

        <nav className="nav">
          {routes.map((route) => {
            const isActive = route.path === currentPath;

            return (
              <a
                key={route.path}
                className={`nav__link${isActive ? " nav__link--active" : ""}`}
                href={route.path}
                onClick={(event) => handleNavigate(event, route.path)}
              >
                <span>{route.path}</span>
                <strong>{route.eyebrow}</strong>
              </a>
            );
          })}
        </nav>
      </aside>

      <main className="content">
        {activeRoute ? (
          <>
            <p className="content__eyebrow">{activeRoute.eyebrow}</p>
            <h2 className="content__title">{activeRoute.title}</h2>
            <p className="content__description">{activeRoute.description}</p>

            <section className="panel">
              <div className="panel__header">
                <span className="panel__dot" />
                <span>Route details</span>
              </div>
              <ul className="panel__list">
                {activeRoute.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            </section>
          </>
        ) : (
          <>
            <p className="content__eyebrow">404</p>
            <h2 className="content__title">Path not mapped</h2>
            <p className="content__description">
              当前 Vite 入口仅保留了原项目已有的三个路径。访问其他路径时需要新增映射。
            </p>
          </>
        )}
      </main>
    </div>
  );
}
