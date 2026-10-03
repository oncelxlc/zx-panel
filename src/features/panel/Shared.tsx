import { useId } from "react";
import { Link } from "react-router";
import {
  ArrowUpRight,
  CircleCheck,
  CircleDashed,
  CircleX,
  Copy,
  Inbox,
  TriangleAlert,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api/client";
import { formatTime } from "@/lib/format";
import { statusLabels } from "./navigation";
import { ToastNotice } from "./ToastNotice";
import type {
  ChoiceProps,
  CopyTextProps,
  DataTableProps,
  MetricCardProps,
  PageHeadingProps,
  QueryStateProps,
  StatusProps,
} from "@/types/panel-ui.type";
/** PageHeading 为业务页面提供紧凑且一致的标题层级。 */
export function PageHeading({ title, description, action }: PageHeadingProps) {
  return (
    <div className="page-heading">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && (
        <div className="flex flex-wrap items-center gap-2">{action}</div>
      )}
    </div>
  );
}
/** Status 同时使用图标和文字表达状态。 */
export function Status({ status, children }: StatusProps) {
  const error = [
    "failed",
    "broken",
    "interrupted",
    "unavailable",
    "不可用",
  ].includes(status);
  const warning = [
    "queued",
    "starting",
    "stopping",
    "warming-up",
    "stale",
    "reconnecting",
    "polling",
    "延迟",
  ].includes(status);
  const good = ["running", "succeeded", "ready", "ok", "live", "正常"].includes(
    status,
  );
  const Icon = error
    ? CircleX
    : warning
      ? TriangleAlert
      : good
        ? CircleCheck
        : CircleDashed;
  return (
    <Badge
      variant={
        error ? "danger" : warning ? "warning" : good ? "success" : "secondary"
      }
    >
      <Icon aria-hidden="true" />
      {children ?? statusLabels[status] ?? status}
    </Badge>
  );
}
/** QueryState 统一错误 Toast；读取区域按约定保留局部重试和请求编号。 */
export function QueryState({
  pending,
  error,
  retry,
  children,
}: QueryStateProps) {
  if (pending)
    return (
      <div className="grid gap-4" role="status" aria-label="正在加载">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  if (error)
    return (
      <>
        <ToastNotice
          id={`request-error:${error instanceof ApiError && error.requestId ? error.requestId : error.message}`}
          title={error.message}
          description={
            error instanceof ApiError && error.requestId
              ? `请求编号：${error.requestId}`
              : undefined
          }
          type="error"
          actionLabel={retry ? "重试" : undefined}
          onAction={retry}
        />
        {(retry || children) && (
          <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>读取失败</AlertTitle>
            <AlertDescription>
              <p>{error.message}</p>
              {error instanceof ApiError && error.requestId && (
                <code>请求编号：{error.requestId}</code>
              )}
              {retry && (
                <Button variant="outline" onClick={retry}>
                  重试
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
      </>
    );
  return children;
}
/** DataTable 让表格只在自身区域横向滚动，并共享可访问空态。 */
export function DataTable({
  headers,
  rows,
  empty = "暂无记录",
  caption,
}: DataTableProps) {
  return (
    <Table>
      {caption && <TableCaption>{caption}</TableCaption>}
      <TableHeader>
        <TableRow>
          {headers.map((header, i) => (
            <TableHead key={i}>{header}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length ? (
          rows.map((row) => (
            <TableRow key={row.id}>
              {row.cells.map((cell, i) => (
                <TableCell key={i}>{cell}</TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={headers.length}>
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Inbox aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>{empty}</EmptyTitle>
                  <EmptyDescription>
                    此处只展示当前服务器的真实记录。
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
/** MetricCard 读数、质量和采样时间一起展示，不把缺失值补零。 */
export function MetricCard({
  title,
  icon: Icon,
  value,
  detail,
  to,
  quality,
  sampledAt,
  percent,
}: MetricCardProps) {
  return (
    <Card className="metric-card">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <Icon aria-hidden="true" className="size-4" />
          {title}
        </CardDescription>
        <CardAction>
          <Button
            nativeButton={false}
            variant="ghost"
            size="icon-sm"
            render={<Link to={to} />}
            aria-label={`查看${title}监控`}
          >
            <ArrowUpRight aria-hidden="true" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="font-mono text-3xl leading-9 font-semibold tracking-tight tabular-nums">
          {value}
        </div>
        <CardDescription>{detail}</CardDescription>
        {percent != null && (
          <Progress value={percent} aria-label={`${title}使用率`} />
        )}
        {quality && quality.quality !== "ok" && (
          <Status status={quality.quality} />
        )}
        {sampledAt && (
          <span className="sr-only">采样时间 {formatTime(sampledAt)}</span>
        )}
      </CardContent>
    </Card>
  );
}
/** Choice 为带标签的有限选项复用官方 Select。 */
export function Choice({
  label,
  value,
  onChange,
  options,
  disabled,
}: ChoiceProps) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <span id={id} className="text-xs text-muted-foreground">
        {label}
      </span>
      <Select
        value={value}
        onValueChange={(next) => {
          if (typeof next === "string") onChange(next);
        }}
        disabled={disabled}
        items={options}
      >
        <SelectTrigger aria-labelledby={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
/** CopyText 只复制明确展示的值，不自动读取环境或秘密字段。 */
export function CopyText({ value }: CopyTextProps) {
  /** 剪贴板权限失败时提供可见反馈。 */
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.add({ title: "已复制", type: "success" });
    } catch {
      toast.add({ title: "无法访问剪贴板，请手动选择复制", type: "error" });
    }
  }
  return (
    <div className="flex min-w-0 items-center gap-1">
      <code className="max-w-80 truncate text-xs" title={value}>
        {value}
      </code>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => void copy()}
        aria-label="复制路径"
      >
        <Copy aria-hidden="true" />
      </Button>
    </div>
  );
}
