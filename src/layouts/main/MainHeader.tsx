import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CircleUserRound,
  ClipboardList,
  LogOut,
  Monitor,
  Moon,
  Search,
  Sun,
} from "lucide-react";
import { logout } from "@/auth/api";
import { useAuthenticatedUser } from "@/auth/authContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/lib/toast";
import { useThemeMode } from "@/theme/themeContext";
import {
  appsQuery,
  queryClient,
  runtimesQuery,
  tasksQuery,
} from "@/features/panel/queries";
import { navigation } from "@/features/panel/navigation";
import "./MainHeader.scss";

/** MainHeader 提供页面搜索、真实任务数、三态主题与账号操作。 */
export function MainHeader() {
  const user = useAuthenticatedUser();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [, setParams] = useSearchParams();
  const { preference, setPreference } = useThemeMode();
  const [search, setSearch] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const tasks = useQuery(tasksQuery);
  const apps = useQuery({ ...appsQuery, enabled: search });
  const runtimes = useQuery({ ...runtimesQuery, enabled: search });
  const active =
    tasks.data?.items.filter((task) =>
      ["queued", "running"].includes(task.status),
    ).length ?? 0;
  const page = navigation.find((item) => pathname.startsWith(item.path));
  useEffect(() => {
    /** 搜索只导航到资源，不直接执行危险动作。 */
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearch((open) => !open);
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  /** 只有服务器确认会话撤销后才显示退出成功。 */
  async function leave() {
    setLeaving(true);
    try {
      await logout();
      queryClient.clear();
      navigate("/login", { replace: true });
    } catch (error) {
      toast.add({
        title: error instanceof Error ? error.message : "退出失败，请重试",
        type: "error",
      });
    } finally {
      setLeaving(false);
    }
  }
  /** 完成搜索导航后恢复页面焦点，由路由壳层处理。 */
  function go(path: string) {
    setSearch(false);
    navigate(path);
  }
  return (
    <div className="header-layout">
      <div className="header-layout__left">
        <SidebarTrigger className="size-11" />
        <Separator orientation="vertical" className="h-5" />
        <span className="text-sm font-medium">{page?.label ?? "zx-panel"}</span>
      </div>
      <div className="header-layout__right">
        <Button
          className="size-11 md:hidden"
          variant="ghost"
          size="icon"
          aria-label="搜索"
          onClick={() => setSearch(true)}
        >
          <Search aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          className="hidden w-64 justify-between md:flex"
          onClick={() => setSearch(true)}
        >
          <Search data-icon="inline-start" />
          <span>搜索页面、运行时或应用…</span>
          <kbd className="text-xs">⌘ K</kbd>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-11"
          aria-label={"任务记录，" + active + " 个进行中"}
          onClick={() =>
            setParams((previous) => {
              previous.set("task", "all");
              return previous;
            })
          }
        >
          <ClipboardList aria-hidden="true" />
          {active > 0 && (
            <Badge className="absolute right-0 top-0">{active}</Badge>
          )}
        </Button>
        <div className="hidden md:block">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label="选择主题"
                />
              }
            >
              {preference === "system" ? (
                <Monitor aria-hidden="true" />
              ) : preference === "dark" ? (
                <Moon aria-hidden="true" />
              ) : (
                <Sun aria-hidden="true" />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuLabel>外观</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setPreference("light")}>
                  亮色
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPreference("dark")}>
                  暗色
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPreference("system")}>
                  跟随系统
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label="账号菜单"
              />
            }
          >
            <CircleUserRound aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                {user.displayName || user.username}
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={() => navigate("/settings")}>
                账号与设置
              </DropdownMenuItem>
              <DropdownMenuItem disabled={leaving} onClick={() => void leave()}>
                <LogOut aria-hidden="true" />
                {leaving ? "正在退出…" : "退出登录"}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <CommandDialog
        open={search}
        onOpenChange={setSearch}
        title="搜索页面、运行时或应用"
        description="选择一个结果跳转到页面，搜索不会执行系统命令。"
      >
        <Command>
          <CommandInput placeholder="搜索页面、运行时或应用…" />
          <CommandList>
            <CommandEmpty>没有找到匹配项</CommandEmpty>
            <CommandGroup heading="页面">
              {navigation.map((item) => (
                <CommandItem key={item.path} onSelect={() => go(item.path)}>
                  <item.icon aria-hidden="true" />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="运行时">
              {runtimes.data
                ?.filter((item) => item.panelCount + item.externalCount > 0)
                .map((item) => (
                  <CommandItem
                    key={item.kind}
                    onSelect={() => go("/runtimes/" + item.kind)}
                  >
                    {item.kind === "node" ? "Node.js" : "Go 工具链"}{" "}
                    {item.defaultVersion}
                  </CommandItem>
                ))}
            </CommandGroup>
            <CommandGroup heading="托管应用">
              {apps.data?.items.map((app) => (
                <CommandItem
                  key={app.id}
                  onSelect={() => go("/apps/" + app.id)}
                >
                  {app.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </div>
  );
}
