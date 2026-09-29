import type {
  ManagedApp,
  OperationPlan,
  OperationSpec,
  PanelSettings,
  RuntimeInstallation,
  Task,
} from "./panel.type";

/** MockState 只在显式演示模式存在，刷新后恢复固定场景。 */
export interface MockState {
  authenticated: boolean;
  initialized: boolean;
  installations: RuntimeInstallation[];
  apps: ManagedApp[];
  tasks: Task[];
  plans: Map<
    string,
    { plan: OperationPlan; operation: OperationSpec; taskId?: string }
  >;
  idempotency: Map<string, { body: string; taskId: string }>;
  sequence: number;
  settings: PanelSettings;
}
