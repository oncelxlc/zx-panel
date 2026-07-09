import { MainSider } from "@/layouts/main/MainSider";
import { Layout, theme } from "antd";
import { Outlet } from "react-router";

const {Header, Content, Footer, Sider} = Layout;

const siderStyle: React.CSSProperties = {
  overflow: "auto",
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
    <Layout hasSider>
      <Sider style={siderStyle}>
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