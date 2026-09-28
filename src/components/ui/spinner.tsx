import { cn } from "@/lib/utils";
import { Loader2Icon } from "lucide-react";

/** 提供可访问的加载标识，减少动效偏好下保持静态。 */
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon
      data-slot="spinner"
      role="status"
      aria-label="正在加载"
      className={cn(
        "size-4 animate-spin motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}

export { Spinner };
