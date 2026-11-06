import { iconStyles } from "@/components/ui/icon.styles";
import * as React from "react";
import { styleProps } from "@/lib/styleProps";
import { styles } from "./chart.styles";
import { ThemeContext } from "@/theme/themeContext";
import type { StyledProps } from "@/types/style.type";
import type { ChartCSSProperties } from "@/types/chart.type";
import * as RechartsPrimitive from "recharts";
import type { TooltipValueType } from "recharts";

/** INITIAL_DIMENSION 在同一组件内共享配置与状态，避免页面重复维护交互规则。 */
const INITIAL_DIMENSION = { width: 320, height: 200 } as const;
import type {
  TooltipNameType,
  ChartConfig,
  ChartContextProps,
} from "@/types/chart.type";
export type { ChartConfig } from "@/types/chart.type";

/** ChartContext 在同一组件内共享配置与状态，避免页面重复维护交互规则。 */
const ChartContext = React.createContext<ChartContextProps | null>(null);

/** useChart 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function useChart() {
  const context = React.useContext(ChartContext);

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />");
  }

  return context;
}

/** ChartContainer 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function ChartContainer({
  id,
  className,
  xstyle,
  style,
  children,
  config,
  initialDimension = INITIAL_DIMENSION,
  ...props
}: StyledProps<
  React.ComponentProps<"div"> & {
    config: ChartConfig;
    children: React.ComponentProps<
      typeof RechartsPrimitive.ResponsiveContainer
    >["children"];
    initialDimension?: {
      width: number;
      height: number;
    };
  }
>) {
  const theme = React.useContext(ThemeContext)?.resolvedMode ?? "dark";
  // 系列名称由调用方决定，CSS 变量承载数据；所有展示规则在组件样式中。
  const colors: ChartCSSProperties = {};
  for (const [key, item] of Object.entries(config)) {
    colors[`--color-${key}`] = item.theme?.[theme] ?? item.color;
  }
  const uniqueId = React.useId();
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, "")}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        {...styleProps([styles.root, xstyle], className, {
          ...colors,
          ...style,
        })}
        {...props}
      >
        <RechartsPrimitive.ResponsiveContainer
          initialDimension={initialDimension}
        >
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

/** ChartTooltip 在同一组件内共享配置与状态，避免页面重复维护交互规则。 */
const ChartTooltip = RechartsPrimitive.Tooltip;

/** ChartTooltipContent 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function ChartTooltipContent({
  active,
  payload,
  className,
  xstyle,
  style,
  indicator = "dot",
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  formatter,
  color,
  nameKey,
  labelKey,
}: StyledProps<
  React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
    React.ComponentProps<"div"> & {
      hideLabel?: boolean;
      hideIndicator?: boolean;
      indicator?: "line" | "dot" | "dashed";
      nameKey?: string;
      labelKey?: string;
    } & Omit<
      RechartsPrimitive.DefaultTooltipContentProps<
        TooltipValueType,
        TooltipNameType
      >,
      "accessibilityLayer"
    >
>) {
  const { config } = useChart();

  const tooltipLabel = React.useMemo(() => {
    if (hideLabel || !payload?.length) {
      return null;
    }

    const [item] = payload;
    const key = `${labelKey ?? item?.dataKey ?? item?.name ?? "value"}`;
    const itemConfig = getPayloadConfigFromPayload(config, item, key);
    const value =
      !labelKey && typeof label === "string"
        ? (config[label]?.label ?? label)
        : itemConfig?.label;

    if (labelFormatter) {
      return (
        <div {...styleProps([styles.label], labelClassName)}>
          {labelFormatter(value, payload)}
        </div>
      );
    }

    if (!value) {
      return null;
    }

    return <div {...styleProps([styles.label], labelClassName)}>{value}</div>;
  }, [
    label,
    labelFormatter,
    payload,
    hideLabel,
    labelClassName,
    config,
    labelKey,
  ]);

  if (!active || !payload?.length) {
    return null;
  }

  const nestLabel = payload.length === 1 && indicator !== "dot";

  return (
    <div {...styleProps([styles.tooltip, xstyle], className, style)}>
      {!nestLabel ? tooltipLabel : null}
      <div {...styleProps(styles.grid)}>
        {payload
          .filter((item) => item.type !== "none")
          .map((item, index) => {
            const key = `${nameKey ?? item.name ?? item.dataKey ?? "value"}`;
            const itemConfig = getPayloadConfigFromPayload(config, item, key);
            const indicatorColor = color ?? item.payload?.fill ?? item.color;

            return (
              <div
                key={index}
                {...styleProps([
                  styles.row,
                  indicator === "dot" && styles.center,
                ])}
              >
                {formatter && item?.value !== undefined && item.name ? (
                  formatter(item.value, item.name, item, index, item.payload)
                ) : (
                  <>
                    {itemConfig?.icon ? (
                      <itemConfig.icon {...styleProps(iconStyles.root)} />
                    ) : (
                      !hideIndicator && (
                        <div
                          {...styleProps([
                            styles.indicator(indicatorColor),
                            styles[indicator],
                            nestLabel &&
                              indicator === "dashed" &&
                              styles.nested,
                          ])}
                        />
                      )
                    )}
                    <div
                      {...styleProps([
                        styles.valueRow,
                        nestLabel && styles.end,
                      ])}
                    >
                      <div {...styleProps(styles.grid)}>
                        {nestLabel ? tooltipLabel : null}
                        <span {...styleProps(styles.muted)}>
                          {itemConfig?.label ?? item.name}
                        </span>
                      </div>
                      {item.value != null && (
                        <span {...styleProps(styles.value)}>
                          {typeof item.value === "number"
                            ? item.value.toLocaleString()
                            : String(item.value)}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

/** ChartLegend 在同一组件内共享配置与状态，避免页面重复维护交互规则。 */
const ChartLegend = RechartsPrimitive.Legend;

/** ChartLegendContent 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function ChartLegendContent({
  className,
  xstyle,
  style,
  hideIcon = false,
  payload,
  verticalAlign = "bottom",
  nameKey,
}: StyledProps<
  React.ComponentProps<"div"> & {
    hideIcon?: boolean;
    nameKey?: string;
  } & RechartsPrimitive.DefaultLegendContentProps
>) {
  const { config } = useChart();

  if (!payload?.length) {
    return null;
  }

  return (
    <div
      {...styleProps(
        [
          styles.legend,
          verticalAlign === "top" ? styles.top : styles.bottom,
          xstyle,
        ],
        className,
        style,
      )}
    >
      {payload
        .filter((item) => item.type !== "none")
        .map((item, index) => {
          const key = `${nameKey ?? item.dataKey ?? "value"}`;
          const itemConfig = getPayloadConfigFromPayload(config, item, key);

          return (
            <div key={index} {...styleProps([styles.legendItem])}>
              {itemConfig?.icon && !hideIcon ? (
                <itemConfig.icon {...styleProps(iconStyles.root)} />
              ) : (
                <div {...styleProps(styles.legendColor(item.color))} />
              )}
              {itemConfig?.label}
            </div>
          );
        })}
    </div>
  );
}

/** getPayloadConfigFromPayload 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function getPayloadConfigFromPayload(
  config: ChartConfig,
  payload: unknown,
  key: string,
) {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }

  const payloadPayload =
    "payload" in payload &&
    typeof payload.payload === "object" &&
    payload.payload !== null
      ? payload.payload
      : undefined;

  let configLabelKey: string = key;

  if (
    key in payload &&
    typeof payload[key as keyof typeof payload] === "string"
  ) {
    configLabelKey = payload[key as keyof typeof payload] as string;
  } else if (
    payloadPayload &&
    key in payloadPayload &&
    typeof payloadPayload[key as keyof typeof payloadPayload] === "string"
  ) {
    configLabelKey = payloadPayload[
      key as keyof typeof payloadPayload
    ] as string;
  }

  return configLabelKey in config ? config[configLabelKey] : config[key];
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
};
