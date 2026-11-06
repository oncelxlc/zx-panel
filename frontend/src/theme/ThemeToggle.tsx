import { styleProps } from "@/lib/styleProps";
import { iconStyles } from "@/components/ui/icon.styles";
import { styles } from "./ThemeToggle.styles";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useThemeMode } from "@/theme/themeContext";
import { Moon, Sun } from "lucide-react";

/** 为后台提供主题切换操作；登录页固定深色，不展示手动入口。 */
export function ThemeToggle() {
  const { resolvedMode, toggleTheme } = useThemeMode();
  const label = resolvedMode === "dark" ? "切换亮色主题" : "切换暗色主题";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            xstyle={styles.button}
            onClick={toggleTheme}
            aria-label={label}
          />
        }
      >
        {resolvedMode === "dark" ? (
          <Sun {...styleProps(iconStyles.root)} aria-hidden="true" />
        ) : (
          <Moon {...styleProps(iconStyles.root)} aria-hidden="true" />
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
