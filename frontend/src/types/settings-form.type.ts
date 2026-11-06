import type { PanelSettings } from "./panel.type";
/** PreferencesFormProps 提供当前服务器设置及乐观并发修订。 */
export interface PreferencesFormProps {
  settings: PanelSettings;
}
/** SettingsFormValues 是允许修改的非秘密设置，不含部署路径与权限配置。 */
export interface SettingsFormValues {
  displayTimezone: string;
  metricsRetentionHours: number;
  taskRetentionDays: number;
  auditRetentionDays: number;
}
/** PasswordFormValues 只在当前表单生命周期中保存明文。 */
export interface PasswordFormValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}
/** SetupFormValues 使用本机 CLI 生成的短期凭据初始化管理员。 */
export interface SetupFormValues {
  token: string;
  username: string;
  password: string;
  confirmPassword: string;
}
