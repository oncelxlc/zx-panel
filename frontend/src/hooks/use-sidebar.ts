import { createContext, useContext } from "react";
import type { SidebarContextProps } from "@/types/ui.type";

/** 在官方侧栏组合组件之间共享桌面展开状态和移动端抽屉状态。 */
export const SidebarContext = createContext<SidebarContextProps | null>(null);

/** 读取侧栏交互状态，阻止组件在缺少 SidebarProvider 时静默失效。 */
export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context)
    throw new Error("useSidebar must be used within a SidebarProvider.");
  return context;
}
