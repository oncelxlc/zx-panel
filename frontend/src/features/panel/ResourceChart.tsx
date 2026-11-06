import { styleProps } from "@/lib/styleProps";
import { styles } from "./ResourceChart.styles";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { DataTable } from "./Shared";
import { formatBytes, formatTime } from "@/lib/format";
import type { ResourceChartProps } from "@/types/panel-ui.type";
/** ResourceChart 按需加载图表，保留缺口并提供文本数据表。 */
export function ResourceChart({
  history,
  label,
  timeZone,
}: ResourceChartProps) {
  const [table, setTable] = useState(false);
  /** 使用与指标一致的单位，避免百分比与吞吐混用。 */
  function format(value: number) {
    return history.unit === "percent"
      ? `${value.toFixed(1)}%`
      : history.unit === "load"
        ? value.toFixed(2)
        : formatBytes(value, history.unit === "bytes-per-second");
  }
  if (!history.points.length)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>尚未积累历史</EmptyTitle>
          <EmptyDescription>
            开始采集后显示实际覆盖范围，缺失时段不会补齐。
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  const valid = history.points.filter((point) => point.avg !== null);
  return (
    <div {...styleProps(styles.stack)}>
      <p {...styleProps(styles.hidden)}>
        {label}，{history.points.length} 个时间点，其中 {valid.length}{" "}
        个有效；缺口代表未采集或不可用。
      </p>
      <ChartContainer
        config={{ avg: { label, color: "var(--chart-1)" } }}
        xstyle={styles.chartContainer}
        initialDimension={{ width: 640, height: 240 }}
      >
        <AreaChart
          accessibilityLayer
          data={history.points}
          margin={{ left: 0, right: 12, top: 8, bottom: 0 }}
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--border)"
            strokeOpacity={0.5}
          />
          <XAxis
            tick={{ fill: "var(--muted-foreground)" }}
            dataKey="at"
            tickLine={false}
            axisLine={false}
            minTickGap={40}
            tickFormatter={(value: string) =>
              formatTime(value, timeZone).slice(-8, -3)
            }
          />
          <YAxis
            tick={{ fill: "var(--muted-foreground)" }}
            width={58}
            tickLine={false}
            axisLine={false}
            domain={history.unit === "percent" ? [0, 100] : [0, "auto"]}
            tickFormatter={(value: number) =>
              history.unit === "percent" ? `${value}%` : format(value)
            }
          />
          <ChartTooltip
            cursor={{ stroke: "var(--border)" }}
            content={
              <ChartTooltipContent
                labelFormatter={(value) => formatTime(String(value), timeZone)}
              />
            }
          />
          <Area
            type="linear"
            dataKey="avg"
            stroke="var(--chart-1)"
            fill="var(--chart-1)"
            fillOpacity={0.06}
            strokeWidth={2}
            isAnimationActive={false}
            connectNulls={false}
          />
        </AreaChart>
      </ChartContainer>
      <div {...styleProps(styles.footer)}>
        <span {...styleProps(styles.caption)}>
          {history.availableFrom
            ? `自 ${formatTime(history.availableFrom, timeZone)} 开始采集`
            : "采集范围不可用"}{" "}
          · 缺口不连线
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setTable(!table)}
          aria-expanded={table}
        >
          {table ? "收起数据表" : "查看数据表"}
        </Button>
      </div>
      {table && (
        <div {...styleProps(styles.tableScroll)}>
          <DataTable
            headers={["时间", "平均", "最低", "最高", "样本"]}
            rows={history.points.map((point) => ({
              id: point.at,
              cells: [
                formatTime(point.at, timeZone),
                point.avg === null ? "缺口" : format(point.avg),
                point.min === null ? "—" : format(point.min),
                point.max === null ? "—" : format(point.max),
                point.sampleCount,
              ],
            }))}
          />
        </div>
      )}
    </div>
  );
}
