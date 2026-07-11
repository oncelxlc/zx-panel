import { LogoutOutlined } from "@ant-design/icons";
import { logout } from "@/auth/api";
import { useAuthenticatedUser } from "@/auth/authContext";
import { Button } from "antd";
import { useState } from "react";
import "./MainHeader.scss";
import { Link, useNavigate } from "react-router";

export function MainHeader() {
  const user = useAuthenticatedUser();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

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
