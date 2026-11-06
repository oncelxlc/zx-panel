import { Monitor, Moon, Sun } from "lucide-react";
import { styleProps } from "@/lib/styleProps";
import { iconStyles } from "@/components/ui/icon.styles";
import { styles } from "./ThemeToggle.styles";
import { Button } from "@/components/ui/button";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useThemeMode } from "@/theme/themeContext";
import type { ThemeToggleProps } from "@/types/theme.type";

/** 以图标入口提供独立的明暗与外壳风格设置，保留键盘和触屏操作。 */
export function ThemeToggle({
  side = "top",
  align = "start",
  sideOffset = 8,
  positionMethod,
}: ThemeToggleProps) {
  const { preference, setPreference, themeStyle, setThemeStyle } = useThemeMode();
  const Icon =
    preference === "system" ? Monitor : preference === "dark" ? Moon : Sun;
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  xstyle={styles.button}
                  aria-label="选择主题"
                />
              }
            />
          }
        >
          <Icon {...styleProps(iconStyles.root)} aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent side={side} sideOffset={sideOffset}>
          外观设置
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={sideOffset}
        positionMethod={positionMethod}
        aria-label="外观设置"
        xstyle={styles.content}
      >
        <ToggleGroup
          aria-label="颜色模式"
          variant="segmented"
          size="sm"
          spacing={1}
          xstyle={styles.options}
          value={[preference]}
          onValueChange={([value]) => {
            if (value === "light" || value === "dark" || value === "system") {
              setPreference(value);
            }
          }}
        >
          <ToggleGroupItem value="light" aria-label="亮色" xstyle={styles.option}>
            <Sun {...styleProps(iconStyles.root)} aria-hidden="true" />
            亮
          </ToggleGroupItem>
          <ToggleGroupItem value="dark" aria-label="暗色" xstyle={styles.option}>
            <Moon {...styleProps(iconStyles.root)} aria-hidden="true" />
            暗
          </ToggleGroupItem>
          <ToggleGroupItem
            value="system"
            aria-label="自动，跟随系统"
            xstyle={styles.option}
          >
            自动
          </ToggleGroupItem>
        </ToggleGroup>
        <FieldSet xstyle={styles.field}>
          <FieldLegend variant="label">主题风格</FieldLegend>
          <ToggleGroup
            aria-label="主题风格"
            variant="segmented"
            size="sm"
            spacing={1}
            xstyle={styles.options}
            value={[themeStyle]}
            onValueChange={([value]) => {
              if (value === "default" || value === "islands") {
                setThemeStyle(value);
              }
            }}
          >
            <ToggleGroupItem value="default" xstyle={styles.option}>
              默认
            </ToggleGroupItem>
            <ToggleGroupItem value="islands" xstyle={styles.option}>
              Islands
            </ToggleGroupItem>
          </ToggleGroup>
        </FieldSet>
      </PopoverContent>
    </Popover>
  );
}
