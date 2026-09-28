import type { AlertProps } from "@/types/ui.type";
import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** 按反馈语义选择提示容器样式。 */
const alertVariants = cva(
  "group/alert relative grid w-full gap-0.5 rounded-lg border px-2.5 py-2 text-left text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        destructive:
          "bg-card text-destructive *:data-[slot=alert-description]:text-destructive/90 *:[svg]:text-current",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

/** 呈现可被辅助技术播报的反馈，支持普通和错误状态。 */
function Alert({ className, variant, ...props }: AlertProps) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

/** 呈现反馈标题并与提示图标对齐。 */
function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "font-medium group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** 容纳反馈详情和后续操作说明。 */
function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-sm text-balance text-muted-foreground md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
        className,
      )}
      {...props}
    />
  );
}

/** 将反馈的附加操作定位到容器右上角。 */
function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      className={cn("absolute top-2 right-2", className)}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription, AlertAction };
