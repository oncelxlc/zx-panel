import { Toast } from "@base-ui/react/toast";

/** toast 共享一份有界界面通知队列，不承担服务端任务状态。 */
export const toast = Toast.createToastManager();
/** createToastManager 供需要独立 Provider 的通知区域创建队列。 */
export const createToastManager = Toast.createToastManager;
/** useToastManager 读取当前通知 Provider 的原生管理接口。 */
export const useToastManager = Toast.useToastManager;
