import { MainHeader } from "@/layouts/main/MainHeader";
import { MainSider } from "@/layouts/main/MainSider";
import { Layout } from "antd";
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

  return (
    <Layout style={{minHeight: "100vh"}}>
      <Header style={{padding: 0}}>
        <MainHeader/>
      </Header>
      <Layout>
        <Sider style={siderStyle} width={240}>
          <MainSider/>
        </Sider>
        <Layout>
          <Content>
            <Outlet/>
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
}
