import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

/** NotFoundPage 提供明确的未知路由状态，不把不存在的页面伪装成概览。 */
export function NotFoundPage() { return <Empty><EmptyHeader><EmptyTitle>页面不存在</EmptyTitle><EmptyDescription>请检查地址或从导航进入已支持的页面。</EmptyDescription></EmptyHeader><Button nativeButton={false} render={<Link to="/overview" />}>返回概览</Button></Empty>; }
