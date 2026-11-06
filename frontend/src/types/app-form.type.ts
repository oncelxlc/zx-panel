import type { ManagedApp, OperationSpec } from "./panel.type";

/** AppFormValues 是尚未提交的本地草稿，秘密不会写入 URL 或持久缓存。 */
export interface AppFormValues {
  name: string;
  kind: "node" | "binary";
  workingDirectory: string;
  executable: string;
  runtimeInstallationId: string;
  runAsUser: string;
  restartPolicy: "no" | "on-failure";
  args: string;
  environment: string;
  removeKeys: string[];
}
/** AppFormProps 只触发预检，不直接保存或控制服务。 */
export interface AppFormProps {
  app?: ManagedApp;
  onReview: (operation: OperationSpec) => void;
  onDirtyChange?: (dirty: boolean) => void;
}
