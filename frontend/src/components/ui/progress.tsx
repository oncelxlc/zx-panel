import { Progress as ProgressPrimitive } from "@base-ui/react/progress"
import { cn } from "@/lib/utils"
import type { ComponentProps } from "react"

/** Progress 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function Progress({
  className,
  children,
  value,
  ...props
}: ProgressPrimitive.Root.Props) {
  return (
    <ProgressPrimitive.Root
      value={value}
      data-slot="progress"
      className={cn("flex flex-wrap gap-3", className)}
      {...props}
    >
      {children}
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </ProgressPrimitive.Root>
  )
}

/** ProgressTrack 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function ProgressTrack({ className, ...props }: ProgressPrimitive.Track.Props) {
  return (
    <ProgressPrimitive.Track
      className={cn(
        "relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted",
        className
      )}
      data-slot="progress-track"
      {...props}
    />
  )
}

/** 复用 Base UI 已归一化的百分比，用位移显示进度，避免每帧修改布局宽度。 */
function renderProgressIndicator(props: ComponentProps<"div">) {
  const width = props.style?.width ?? "0%"
  return <div {...props} style={{
    ...props.style,
    width: "100%",
    transform: `translateX(calc(${typeof width === "number" ? `${width}px` : width} - 100%))`,
  }} />
}

/** ProgressIndicator 保留官方数值语义和自定义 render，默认只过渡进度填充的位移。 */
function ProgressIndicator({
  className,
  render = renderProgressIndicator,
  ...props
}: ProgressPrimitive.Indicator.Props) {
  return (
    <ProgressPrimitive.Indicator
      data-slot="progress-indicator"
      render={render}
      className={cn("h-full bg-primary transition-transform duration-(--motion-content) motion-reduce:transition-none", className)}
      {...props}
    />
  )
}

/** ProgressLabel 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function ProgressLabel({ className, ...props }: ProgressPrimitive.Label.Props) {
  return (
    <ProgressPrimitive.Label
      className={cn("text-sm font-medium", className)}
      data-slot="progress-label"
      {...props}
    />
  )
}

/** ProgressValue 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function ProgressValue({ className, ...props }: ProgressPrimitive.Value.Props) {
  return (
    <ProgressPrimitive.Value
      className={cn(
        "ml-auto text-sm text-muted-foreground tabular-nums",
        className
      )}
      data-slot="progress-value"
      {...props}
    />
  )
}

export {
  Progress,
  ProgressTrack,
  ProgressIndicator,
  ProgressLabel,
  ProgressValue,
}
