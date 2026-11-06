import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./progress.styles";
import type { ComponentProps } from "react";

/** Progress 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function Progress({
  className,
  xstyle,
  style,
  children,
  value,
  ...props
}: StyledProps<ProgressPrimitive.Root.Props>) {
  return (
    <ProgressPrimitive.Root
      value={value}
      data-slot="progress"
      {...styleProps([styles.root, xstyle], className, style)}
      {...props}
    >
      {children}
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </ProgressPrimitive.Root>
  );
}

/** ProgressTrack 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function ProgressTrack({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<ProgressPrimitive.Track.Props>) {
  return (
    <ProgressPrimitive.Track
      {...styleProps([styles.track, xstyle], className, style)}
      data-slot="progress-track"
      {...props}
    />
  );
}

/** 复用 Base UI 已归一化的百分比，用位移显示进度，避免每帧修改布局宽度。 */
function renderProgressIndicator(props: ComponentProps<"div">) {
  const { width = "0%", ...remainingStyle } = props.style ?? {};
  return (
    <div
      {...props}
      {...styleProps(
        styles.fill(typeof width === "number" ? `${width}px` : width),
        props.className,
        remainingStyle,
      )}
    />
  );
}

/** ProgressIndicator 保留官方数值语义和自定义 render，默认只过渡进度填充的位移。 */
function ProgressIndicator({
  className,
  xstyle,
  style,
  render = renderProgressIndicator,
  ...props
}: StyledProps<ProgressPrimitive.Indicator.Props>) {
  return (
    <ProgressPrimitive.Indicator
      data-slot="progress-indicator"
      render={render}
      {...styleProps([styles.indicator, xstyle], className, style)}
      {...props}
    />
  );
}

/** ProgressLabel 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function ProgressLabel({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<ProgressPrimitive.Label.Props>) {
  return (
    <ProgressPrimitive.Label
      {...styleProps([styles.label, xstyle], className, style)}
      data-slot="progress-label"
      {...props}
    />
  );
}

/** ProgressValue 组合官方组件的焦点、键盘与语义样式，页面通过属性扩展。 */
function ProgressValue({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<ProgressPrimitive.Value.Props>) {
  return (
    <ProgressPrimitive.Value
      {...styleProps([styles.value, xstyle], className, style)}
      data-slot="progress-value"
      {...props}
    />
  );
}

export {
  Progress,
  ProgressTrack,
  ProgressIndicator,
  ProgressLabel,
  ProgressValue,
};
