import { LogoutOutlined } from "@ant-design/icons";
import { logout } from "@/auth/api";
import { useAuthenticatedUser } from "@/auth/authContext";
import { Button } from "antd";
import { useState } from "react";
import "./MainHeader.scss";
import { Link, useNavigate } from "react-router";

/**
 * MainHeader 展示产品入口、当前用户和退出登录操作。
 * 退出完成后始终返回公开登录页。
 */
export function MainHeader() {
  const user = useAuthenticatedUser();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  // 服务端注销失败时仍由 API 客户端清理本地会话并完成跳转。
  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      navigate("/login", {replace: true});
    }
  };

  return (
    <div className="header-layout">
      <div className="header-layout__left">
        <Link to="./">ZX PANEL</Link>
      </div>
      <div className="header-layout__right">
        <span className="header-layout__user">{user.displayName || user.username}</span>
        <Button
          icon={<LogoutOutlined/>}
          loading={loggingOut}
          onClick={handleLogout}
          type="text"
        >
          退出登录
        </Button>
      </div>
    </div>
  );
}
