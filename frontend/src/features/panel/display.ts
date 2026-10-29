import { useQuery } from "@tanstack/react-query";
import { bootstrapQuery, settingsQuery } from "./queries";

/** useDisplayTimezone 统一应用服务器、浏览器或指定 IANA 时区偏好。 */
export function useDisplayTimezone() {
  const settings = useQuery(settingsQuery);
  const bootstrap = useQuery(bootstrapQuery);
  const choice = settings.data?.displayTimezone ?? "server";
  return choice === "browser"
    ? undefined
    : choice === "server"
      ? bootstrap.data?.system.serverTimezone
      : choice;
}
