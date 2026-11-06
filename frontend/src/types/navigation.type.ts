/**
 * RoutePath 描述保留的旧版 App 页面能够识别的路径。
 * 该类型仅服务于未接入当前入口的兼容页面。
 */
export type RoutePath = "/" | "/nginx" | "/nginx/index";

/**
 * RouteContent 描述旧版 App 路径对应的展示内容。
 * 每个路径包含标题、说明和详情列表。
 */
export type RouteContent = {
  path: RoutePath;
  eyebrow: string;
  title: string;
  description: string;
  details: string[];
};
