import { expect, it } from "vitest";
import * as stylex from "@stylexjs/stylex";
import { styleProps } from "@/lib/styleProps";

/** 动态属性验证编译后的自定义变量不会被原生定位样式覆盖丢失。 */
const styles = stylex.create({ dynamic: (height: number) => ({ height }) });

it("preserves native layout values and Base UI state callbacks", () => {
  const compiled = stylex.props(styles.dynamic(36));
  const native = styleProps(styles.dynamic(36), "test-marker", { top: 8 });
  expect(native.className).toContain("test-marker");
  expect(native.style).toEqual({ ...compiled.style, top: 8 });
  const stateful = styleProps(
    styles.dynamic(36),
    (state: { open: boolean }) => (state.open ? "open-marker" : undefined),
    (state) => ({ top: state.open ? 16 : 0 }),
  );
  if (
    typeof stateful.className !== "function" ||
    typeof stateful.style !== "function"
  )
    throw new Error("State callbacks were lost");
  expect(stateful.className({ open: true })).toContain("open-marker");
  expect(stateful.className({ open: false })).not.toContain("open-marker");
  expect(stateful.style({ open: true })).toEqual({
    ...compiled.style,
    top: 16,
  });
});
