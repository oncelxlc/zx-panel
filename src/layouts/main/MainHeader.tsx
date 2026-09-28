import { logout } from "@/auth/api";
import { useAuthenticatedUser } from "@/auth/authContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { ThemeToggle } from "@/theme/ThemeToggle";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import "./MainHeader.scss";

/** 使用库内组件组合导航入口、用户身份和全局操作，保持本地退出的可靠性。 */
export function MainHeader() {
  const user = useAuthenticatedUser();
  const name = user.displayName || user.username;
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  /** API 客户端始终清理令牌，这里消化注销失败并返回公开登录页。 */
  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      // 本地会话已经清理，服务端不可用也不阻止退出。
    } finally {
      navigate("/login", { replace: true });
    }
  }

  return (
    <div className="header-layout">
      <div className="header-layout__left">
        <SidebarTrigger className="size-11" />
        <Separator orientation="vertical" className="h-6" />
        <Badge variant="outline">管理控制台</Badge>
      </div>
      <div className="header-layout__right">
        <Item size="xs" className="hidden w-auto min-w-0 p-0 sm:flex">
          <ItemMedia>
            <Avatar aria-hidden="true">
              <AvatarFallback>{Array.from(name)[0]}</AvatarFallback>
            </Avatar>
          </ItemMedia>
          <ItemContent className="min-w-0">
            <ItemTitle className="max-w-40 truncate">{name}</ItemTitle>
          </ItemContent>
        </Item>
        <ThemeToggle />
        <Button
          variant="ghost"
          className="h-11"
          onClick={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut ? (
            <Spinner data-icon="inline-start" aria-hidden="true" />
          ) : (
            <LogOut data-icon="inline-start" aria-hidden="true" />
          )}
          {loggingOut ? "正在退出…" : "退出登录"}
        </Button>
      </div>
    </div>
  );
}
