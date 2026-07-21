import { useThemeMode } from "@/theme/themeContext";
import { Button } from "antd";

/**
 * IndexPage 渲染登录后的首页占位内容和主题切换入口。
 * 页面用于验证主布局、鉴权守卫与主题上下文的集成链路。
 */
export function IndexPage() {
  const {resolvedMode, toggleTheme} = useThemeMode();

  return (
    <div style={{height: "106vh"}}>
      <Button type="primary">按钮</Button>
      <Button type="dashed" onClick={toggleTheme}>
        {resolvedMode === "dark" ? "切换亮色" : "切换暗色"}
      </Button>
    </div>
  );
}
