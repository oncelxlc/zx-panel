import {
  Activity,
  Boxes,
  Gauge,
  ScrollText,
  Settings2,
  Workflow,
} from "lucide-react";
import type { NavigationItem } from "@/types/panel-ui.type";
/** navigation 仅包含首发已实现的六个本机管理入口。 */
export const navigation: NavigationItem[] = [
  { path: "/overview", label: "概览", icon: Gauge },
  { path: "/runtimes", label: "运行时", icon: Boxes },
  { path: "/apps", label: "应用与进程", icon: Workflow },
  { path: "/monitoring", label: "监控", icon: Activity },
  { path: "/logs", label: "日志", icon: ScrollText },
  { path: "/settings", label: "设置", icon: Settings2 },
];
/** statusLabels 为服务端状态提供明确文案，不把安装与运行混为一谈。 */
export const statusLabels: Record<string, string> = {
  queued: "排队中",
  running: "运行中",
  succeeded: "已完成",
  failed: "失败",
  canceled: "已取消",
  interrupted: "已中断",
  ready: "就绪",
  broken: "校验异常",
  incompatible: "不兼容",
  unknown: "未知",
  stopped: "已停止",
  starting: "启动中",
  stopping: "停止中",
  ok: "正常",
  "warming-up": "采集中",
  unavailable: "不可用",
  fresh: "目录已更新",
  stale: "缓存目录",
  live: "已连接",
  connecting: "连接中",
  reconnecting: "重连中",
  polling: "轮询回退",
};

/** actionLabels 面向操作人展示任务目的，接口动作名仍保留在数据层。 */
export const actionLabels: Record<string, string> = {
  "runtime.install": "安装运行时",
  "runtime.set-default": "设置默认版本",
  "runtime.uninstall": "卸载运行时",
  "app.create": "登记应用",
  "app.update": "保存应用配置",
  "app.start": "启动应用",
  "app.stop": "停止应用",
  "app.restart": "重启应用",
  "app.delete": "移除应用登记",
  "catalog.refresh": "检查版本目录",
  "logs.export": "导出日志",
};
/** stageLabels 区分持久受理与真实执行阶段，不制造进度百分比。 */
export const stageLabels: Record<string, string> = {
  queued: "等待执行",
  preflight: "执行前检查",
  download: "下载归档",
  verify: "校验安装包",
  commit: "提交变更",
  catalog: "检查官方目录",
  export: "读取并导出日志",
  execute: "执行操作",
  finalize: "核验结果",
  finished: "执行结束",
};
