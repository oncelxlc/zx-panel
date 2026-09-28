import { useSyncExternalStore } from "react";

/** 与官方侧栏的 md 断点保持一致。 */
const MOBILE_QUERY = "(max-width: 767px)";

/** 订阅浏览器断点变化，组件卸载时移除监听。 */
function subscribe(onChange: () => void) {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** 读取浏览器实际断点，不额外维护可能滞后的 React 状态。 */
function getSnapshot() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

/** 服务端渲染不读取浏览器媒体查询，水合后由订阅同步。 */
function getServerSnapshot() {
  return false;
}

/** 为官方侧栏提供可订阅且兼容服务端渲染的移动端状态。 */
export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
