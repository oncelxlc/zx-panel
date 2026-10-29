import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { HistoryResponse, MetricValue, OperationSpec } from "./panel.type";
/** CopyTextProps 只接受已经向用户展示且允许复制的公开文本。 */
export interface CopyTextProps {
  value: string;
}

/** NavigationItem 将路由、标签与图标直接组合，避免字符串图标查找。 */
export interface NavigationItem {
  path: string;
  label: string;
  icon: LucideIcon;
}
/** PageHeadingProps 保持所有业务页面的标题、说明和主动作一致。 */
export interface PageHeadingProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}
/** DataTableProps 接受已经格式化的单元格，结构和空态由组件统一负责。 */
export interface DataTableProps {
  headers: ReactNode[];
  rows: { id: string; cells: ReactNode[] }[];
  empty?: string;
  caption?: string;
}
/** StatusProps 同时呈现文字和图标，颜色不单独表达状态。 */
export interface StatusProps {
  status: string;
  children?: ReactNode;
}
/** QueryStateProps 区分首次加载、局部读取失败与空资源。 */
export interface QueryStateProps {
  pending?: boolean;
  error?: Error | null;
  retry?: () => void;
  children?: ReactNode;
}
/** ToastNoticeProps 只接收稳定的通知文本，业务详情与确认仍由原页面负责。 */
export interface ToastNoticeProps {
  id?: string;
  title: string;
  description?: string;
  type?: "info" | "success" | "warning" | "error";
  actionLabel?: string;
  onAction?: () => void;
}
/** MetricCardProps 让指标读数的时间、质量和导航一同可见。 */
export interface MetricCardProps {
  title: string;
  icon: LucideIcon;
  value: string;
  detail: string;
  to: string;
  quality?: MetricValue;
  sampledAt?: string;
  percent?: number | null;
}
/** ChartProps 只展示一个单位的历史，缺口不插值。 */
export interface ResourceChartProps {
  history: HistoryResponse;
  label: string;
  timeZone?: string;
}
/** OperationSheetProps 只接收结构化动作，绝不传入 shell 或远程主机。 */
export interface OperationSheetProps {
  operation: OperationSpec | null;
  onClose: () => void;
}
/** ChoiceProps 为有限离散选择复用官方 Select。 */
export interface ChoiceProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}

/** UnsavedChangesProps 只表示是否存在需要确认的未提交草稿。 */
export interface UnsavedChangesProps {
  dirty: boolean;
}

/** ApplicationLogsProps 将日志视图限制到当前登记应用。 */
export interface ApplicationLogsProps {
  sourceId?: string;
  embedded?: boolean;
}
