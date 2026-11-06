import { iconStyles } from "@/components/ui/icon.styles";
import { styleProps } from "@/lib/styleProps";
import { styles } from "./MainHeader.styles";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Search } from "lucide-react";
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
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  appsQuery,
  runtimesQuery,
  tasksQuery,
} from "@/features/panel/queries";
import { navigation } from "@/features/panel/navigation";

/** MainHeader 提供导航折叠、当前页面、资源搜索和真实任务数。 */
export function MainHeader() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [, setParams] = useSearchParams();
  const [search, setSearch] = useState(false);
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
  /** 完成搜索导航后恢复页面焦点，由路由壳层处理。 */
  function go(path: string) {
    setSearch(false);
    navigate(path);
  }
  return (
    <div {...styleProps(styles.headerLayout)}>
      <div {...styleProps(styles.leading)}>
        <SidebarTrigger xstyle={styles.sidebarTrigger} />
        <span {...styleProps(styles.pageTitle)}>
          {page?.label ?? "zx-panel"}
        </span>
      </div>
      <div {...styleProps(styles.actions)}>
        <Button
          xstyle={styles.mobileSearch}
          variant="ghost"
          size="icon"
          aria-label="搜索"
          onClick={() => setSearch(true)}
        >
          <Search {...styleProps(iconStyles.root)} aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          xstyle={styles.desktopSearch}
          onClick={() => setSearch(true)}
        >
          <Search {...styleProps(iconStyles.root)} data-icon="inline-start" />
          <span>搜索页面、运行时或应用…</span>
          <kbd {...styleProps(styles.shortcut)}>⌘ K</kbd>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          xstyle={styles.taskButton}
          aria-label={"任务记录，" + active + " 个进行中"}
          onClick={() =>
            setParams((previous) => {
              previous.set("task", "all");
              return previous;
            })
          }
        >
          <ClipboardList {...styleProps(iconStyles.root)} aria-hidden="true" />
          {active > 0 && <Badge xstyle={styles.taskCount}>{active}</Badge>}
        </Button>
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
                  <item.icon
                    {...styleProps(iconStyles.root)}
                    aria-hidden="true"
                  />
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
