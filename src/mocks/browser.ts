import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

/** worker 仅由显式 mock 模式动态导入，生产不会自动回退到演示。 */
export const worker = setupWorker(...handlers);
