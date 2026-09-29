import type { MetricValue } from "@/types/panel.type";

/** formatBytes 全站使用二进制容量单位，null 保持不可用语义。 */
export function formatBytes(
  value: number | null | undefined,
  rate = false,
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let n = value;
  let index = 0;
  while (n >= 1024 && index < units.length - 1) {
    n /= 1024;
    index++;
  }
  return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: index > 0 ? 1 : 0 }).format(n)} ${units[index]}${rate ? "/s" : ""}`;
}
/** formatPercent 不把 warming-up 或采集失败转换成零。 */
export function formatPercent(
  value: MetricValue | number | null | undefined,
): string {
  const n = typeof value === "object" && value !== null ? value.value : value;
  return n == null ? "—" : `${n.toFixed(1)}%`;
}
/** formatTime 默认使用服务器返回的时区，调用方也可选择浏览器时区。 */
export function formatTime(
  value: string | null | undefined,
  timeZone?: string,
): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone,
  }).format(date);
}
/** formatDuration 将本机单调运行时间转换为易读时长。 */
export function formatDuration(seconds: number | null): string {
  if (seconds == null) return "不可用";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days > 0
    ? `${days} 天 ${hours} 小时`
    : `${hours} 小时 ${minutes} 分钟`;
}
/** freshness 按字段自己的采样频率判断过期，连接心跳不参与计算。 */
export function freshness(
  at: string,
  now: number,
  filesystem = false,
): "正常" | "延迟" | "不可用" {
  const age = now - Date.parse(at);
  if (!Number.isFinite(age) || age > (filesystem ? 90_000 : 15_000))
    return "不可用";
  return age > (filesystem ? 45_000 : 6000) ? "延迟" : "正常";
}
