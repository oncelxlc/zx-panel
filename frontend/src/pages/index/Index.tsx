import { useAuthenticatedUser } from "@/auth/authContext";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** 展示当前登录用户的欢迎信息，不呈现尚未接入的管理功能或虚构统计。 */
export function IndexPage() {
  const user = useAuthenticatedUser();
  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle role="heading" aria-level={1}>
          你好，{user.displayName || user.username}
        </CardTitle>
        <CardDescription>欢迎使用 ZX Panel 管理控制台。</CardDescription>
      </CardHeader>
      <CardContent>
        <CardDescription>
          你已成功登录。可通过右上角切换主题或退出当前会话。
        </CardDescription>
      </CardContent>
    </Card>
  );
}
