import { useEffect, useId, useRef } from "react";
import { useToastManager } from "@/lib/toast";
import type { ToastNoticeProps } from "@/types/panel-ui.type";

/** ToastNotice 将状态变化接入共享通知，稳定标识避免重渲染或 StrictMode 重复堆叠。 */
export function ToastNotice({
  id,
  title,
  description,
  type = "info",
  actionLabel,
  onAction,
}: ToastNoticeProps) {
  const generatedId = useId();
  const noticeId = id ?? generatedId;
  const { add, close } = useToastManager();
  const action = useRef(onAction);

  useEffect(() => {
    action.current = onAction;
  }, [onAction]);

  useEffect(() => {
    add({
      id: noticeId,
      title,
      description,
      type,
      actionProps: actionLabel
        ? { children: actionLabel, onClick: () => action.current?.() }
        : undefined,
    });
    return () => close(noticeId);
  }, [add, close, noticeId, title, description, type, actionLabel]);

  return null;
}
