import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useThemeMode } from "@/theme/themeContext";
import { Moon, Sun } from "lucide-react";

/** 为后台提供主题切换操作；登录页强制跟随系统，不展示手动入口。 */
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
            className="size-11"
            onClick={toggleTheme}
            aria-label={label}
          />
        }
      >
        {resolvedMode === "dark" ? (
          <Sun aria-hidden="true" />
        ) : (
          <Moon aria-hidden="true" />
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
