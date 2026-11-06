import type {
  FieldProps,
  FieldLegendProps,
  FieldErrorProps,
} from "@/types/ui.type";
import { useMemo } from "react";
import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./field.styles";

import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

/** 以原生字段集合语义组织关联表单控件。 */
function FieldSet({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"fieldset">>) {
  return (
    <fieldset
      data-slot="field-set"
      {...styleProps([styles.set, xstyle], className, style)}
      {...props}
    />
  );
}

/** 为字段集合提供可见标题与标签样式。 */
function FieldLegend({
  className,
  xstyle,
  style,
  variant = "legend",
  ...props
}: StyledProps<FieldLegendProps>) {
  return (
    <legend
      data-slot="field-legend"
      data-variant={variant}
      {...styleProps([styles.legend, xstyle], className, style)}
      {...props}
    />
  );
}

/** 统一多个字段的间距，并提供响应式布局容器。 */
function FieldGroup({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="field-group"
      {...styleProps([styles.group, xstyle], className, style)}
      {...props}
    />
  );
}

/** 组合标签、控件和反馈，依据校验状态展示错误样式。 */
function Field({
  className,
  xstyle,
  style,
  orientation = "vertical",
  ...props
}: StyledProps<FieldProps>) {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      {...styleProps(
        [styles.root, styles[orientation], xstyle],
        className,
        style,
      )}
      {...props}
    />
  );
}

/** 组织横向字段内的标签和说明内容。 */
function FieldContent({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="field-content"
      {...styleProps([styles.content, xstyle], className, style)}
      {...props}
    />
  );
}

/** 关联字段标签，并反映字段禁用和选择状态。 */
function FieldLabel({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<typeof Label>>) {
  return (
    <Label
      data-slot="field-label"
      xstyle={[styles.label, xstyle]}
      className={className}
      style={style}
      {...props}
    />
  );
}

/** 为无需关联输入元素的字段分组提供标题样式。 */
function FieldTitle({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="field-label"
      {...styleProps([styles.title, xstyle], className, style)}
      {...props}
    />
  );
}

/** 展示字段帮助信息，可通过 aria-describedby 关联控件。 */
function FieldDescription({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"p">>) {
  return (
    <p
      data-slot="field-description"
      {...styleProps([styles.description, xstyle], className, style)}
      {...props}
    />
  );
}

/** 分隔表单区域，并支持在分隔线上显示说明。 */
function FieldSeparator({
  children,
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="field-separator"
      data-content={!!children}
      {...styleProps([styles.separator, xstyle], className, style)}
      {...props}
    >
      <Separator xstyle={styles.separatorLine} />
      {children && (
        <span
          {...styleProps(styles.separatorContent)}
          data-slot="field-separator-content"
        >
          {children}
        </span>
      )}
    </div>
  );
}

/** 去重并播报字段错误，也支持直接传入校验消息。 */
function FieldError({
  className,
  xstyle,
  style,
  children,
  errors,
  ...props
}: StyledProps<FieldErrorProps>) {
  const content = useMemo(() => {
    if (children) {
      return children;
    }

    if (!errors?.length) {
      return null;
    }

    const uniqueErrors = [
      ...new Map(errors.map((error) => [error?.message, error])).values(),
    ];

    if (uniqueErrors?.length == 1) {
      return uniqueErrors[0]?.message;
    }

    return (
      <ul {...styleProps(styles.errorList)}>
        {uniqueErrors.map(
          (error, index) =>
            error?.message && <li key={index}>{error.message}</li>,
        )}
      </ul>
    );
  }, [children, errors]);

  return (
    <div
      role={content ? "alert" : undefined}
      aria-hidden={!content || undefined}
      tabIndex={content ? 0 : undefined}
      data-slot="field-error"
      {...styleProps([styles.error, xstyle], className, style)}
      {...props}
    >
      {content}
    </div>
  );
}

export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle,
};
