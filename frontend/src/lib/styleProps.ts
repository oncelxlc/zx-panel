import * as stylex from "@stylexjs/stylex";
import type { CSSProperties } from "react";
import type {
  ResolvedStyleProps,
  StatefulStyleProps,
} from "@/types/style.type";

/** 在组件边界合并 StyleX 样式，保留外部 DOM 标记和 Base UI 动态定位属性。 */
export function styleProps(
  styles: stylex.StyleXStyles,
  className?: string,
  style?: CSSProperties,
): ResolvedStyleProps;
/** 状态回调由 Base UI 调用，组合时不提前执行或丢弃回调。 */
export function styleProps<State>(
  styles: stylex.StyleXStyles,
  className?: string | ((state: State) => string | undefined),
  style?: CSSProperties | ((state: State) => CSSProperties | undefined),
): StatefulStyleProps<State>;
/** 原子样式先合并，再接入调用方的 DOM 标记与原生定位属性。 */
export function styleProps<State>(
  styles: stylex.StyleXStyles,
  className?: string | ((state: State) => string | undefined),
  style?: CSSProperties | ((state: State) => CSSProperties | undefined),
) {
  const compiled = stylex.props(styles);
  return {
    ...compiled,
    className:
      typeof className === "function"
        ? (state: State) =>
            [compiled.className, className(state)].filter(Boolean).join(" ")
        : [compiled.className, className].filter(Boolean).join(" "),
    style:
      typeof style === "function"
        ? (state: State) => ({ ...compiled.style, ...style(state) })
        : { ...compiled.style, ...style },
  };
}
