import { iconStyles } from "@/components/ui/icon.styles";
import { styleProps } from "@/lib/styleProps";
import type { StyledProps } from "@/types/style.type";
import { styles } from "./spinner.styles";
import { Loader2Icon } from "lucide-react";

/** 提供可访问的加载标识，减少动效偏好下保持静态。 */
function Spinner({
  className,
  xstyle,
  style,
  ...props
}: StyledProps<React.ComponentProps<"svg">>) {
  return (
    <Loader2Icon
      data-slot="spinner"
      role="status"
      aria-label="正在加载"
      {...styleProps(
        [iconStyles.root, [styles.root, xstyle]],
        className,
        style,
      )}
      {...props}
    />
  );
}

export { Spinner };
