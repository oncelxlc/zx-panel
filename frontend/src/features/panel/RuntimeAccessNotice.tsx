import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { bootstrapQuery } from "./queries";
import { QueryState } from "./Shared";

/** RuntimeAccessNotice 在进入面板时解释缺失的管理权限，重新检查后随真实能力恢复。 */
export function RuntimeAccessNotice() {
  const bootstrap = useQuery(bootstrapQuery);
  const [dismissed, setDismissed] = useState(false);
  const capability = bootstrap.data?.capabilities.installRuntime;
  const needsHelper = capability?.reasonCode === "HELPER_DISABLED" ||
    capability?.reasonCode === "HELPER_UNAVAILABLE" || capability?.reasonCode === "HELPER_OUTDATED";
  if (!needsHelper || capability?.enabled) return null;
  return (
    <>
      <Alert className="mb-4">
        <AlertTitle>运行时管理权限未就绪</AlertTitle>
        <AlertDescription>
          <p>{capability.message}</p>
          <Button variant="outline" size="sm" onClick={() => setDismissed(false)}>
            查看启动与重启步骤
          </Button>
        </AlertDescription>
      </Alert>
      <AlertDialog open={!dismissed} onOpenChange={(open) => setDismissed(!open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>需要启用管理权限</AlertDialogTitle>
            <AlertDialogDescription>
              {capability.message} Go 后端使用普通账号运行，特权操作交给独立 helper。
              已按部署模板安装时，请在服务器终端执行 sudo systemctl restart zx-panel-helper。
              首次启用 helper 后需重启 Go 后端；已启用时可直接重新检查。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <QueryState error={bootstrap.error} />
          <AlertDialogFooter>
            <AlertDialogCancel>暂时浏览</AlertDialogCancel>
            <AlertDialogAction
              disabled={bootstrap.isFetching}
              onClick={() => void bootstrap.refetch()}
            >
              {bootstrap.isFetching ? "正在检查" : "重新检查权限"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
