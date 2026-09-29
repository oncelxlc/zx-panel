import type { ComponentType, ReactNode } from "react";

/** TooltipNameType 接收 Recharts 系列标签，不对格式化值作额外转换。 */
export type TooltipNameType = number | string;
/** ChartConfig 将系列映射到图例名称与语义颜色，按亮暗主题选择。 */
export type ChartConfig = Record<
  string,
  { label?: ReactNode; icon?: ComponentType } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<"light" | "dark", string> }
  )
>;
/** ChartContextProps 只在同一个图表容器中共享系列配置。 */
export type ChartContextProps = { config: ChartConfig };
/** ChartStyleProps 将官方图表样式限制在当前容器 ID。 */
export interface ChartStyleProps {
  id: string;
  config: ChartConfig;
}
