import { useThemeMode } from "@/theme/themeContext";
import { Button } from "antd";

export function IndexPage() {
  const {resolvedMode, toggleTheme} = useThemeMode();

  return (
    <div>
      <Button type="primary">按钮</Button>
      <Button type='dashed' onClick={toggleTheme}>
        {resolvedMode === "dark" ? "切换亮色" : "切换暗色"}
      </Button>
    </div>
  );
}