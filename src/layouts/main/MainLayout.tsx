import { MainSider } from "@/layouts/main/MainSider";
import { Layout, theme } from "antd";
import { CSSProperties } from "react";
import { Outlet } from "react-router";

const {Header, Content, Sider} = Layout;

const siderStyle: CSSProperties = {
  height: "100vh",
  position: "sticky",
  insetInlineStart: 0,
  top: 0,
  scrollbarWidth: "thin",
  scrollbarGutter: "stable",
};

export default function MainLayout() {
  const {
    token: {colorBgContainer, borderRadiusLG},
  } = theme.useToken();

  return (
    <Layout hasSider style={{minHeight: "100vh", borderRadius: borderRadiusLG}}>
      <Sider style={siderStyle} width={240}>
        <MainSider/>
      </Sider>
      <Layout>
        <Header style={{padding: 0, background: colorBgContainer}}/>
        <Content>
          <Outlet/>
        </Content>
      </Layout>
    </Layout>
  );
}
