import type { MouseEvent } from "react";
import { useEffect, useState } from "react";

type RoutePath = "/" | "/nginx" | "/nginx/index";

type RouteContent = {
  path: RoutePath;
  eyebrow: string;
  title: string;
  description: string;
  details: string[];
};

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

function normalizePath(pathname: string) {
  if (!pathname) {
    return "/";
  }

  if (pathname !== "/" && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

function getRoute(pathname: string) {
  return routes.find((route) => route.path === pathname);
}

function useCurrentPath() {
  const [currentPath, setCurrentPath] = useState("/");

  useEffect(() => {
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

export default function App() {
  const { currentPath, setCurrentPath } = useCurrentPath();
  const activeRoute = getRoute(currentPath);

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
