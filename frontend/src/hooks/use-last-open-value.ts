import { useState } from "react";

/** 保留抽屉最后打开时的显示标识，关闭参数立即生效时仍可完成退场；请求须另按 open 禁用。 */
export function useLastOpenValue(value: string, open: boolean): string {
  const [lastOpenValue, setLastOpenValue] = useState(value);
  if (open && value !== lastOpenValue) setLastOpenValue(value);
  return open ? value : lastOpenValue;
}
