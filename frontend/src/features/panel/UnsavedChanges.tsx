import { useEffect } from "react";
import { useBlocker } from "react-router";
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
import type { UnsavedChangesProps } from "@/types/panel-ui.type";

/** UnsavedChanges 保护尚未交给预检的表单，秘密草稿只保留在当前页面内存。 */
export function UnsavedChanges({ dirty }: UnsavedChangesProps) {
  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (!dirty) return;
    /** 原生退出提示只在确有未交付草稿时注册。 */
    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  return (
    <AlertDialog
      open={blocker.state === "blocked"}
      onOpenChange={(open) => {
        if (!open && blocker.state === "blocked") blocker.reset();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>放弃尚未提交的修改？</AlertDialogTitle>
          <AlertDialogDescription>
            当前草稿尚未保存。离开后需要重新输入，环境秘密不会被缓存。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => blocker.state === "blocked" && blocker.reset()}
          >
            继续编辑
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => blocker.state === "blocked" && blocker.proceed()}
          >
            放弃修改
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
