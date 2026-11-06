import type { StyleXStyles } from "@stylexjs/stylex";
import type { CSSProperties } from "react";

/** 保留组件原有属性，通过 xstyle 合并调用方布局，避免原子类名覆盖顺序不确定。 */
export type StyledProps<Props> = Props & { xstyle?: StyleXStyles };

/** 原生节点获得确定的类名和样式属性。 */
export type ResolvedStyleProps = { className: string; style: CSSProperties };

/** Base UI 可在内部状态变化时重新计算外部样式回调。 */
export type StatefulStyleProps<State> = {
  className: string | ((state: State) => string);
  style: CSSProperties | ((state: State) => CSSProperties);
};
