import { MainHeader } from "@/layouts/main/MainHeader";
import { MainSider } from "@/layouts/main/MainSider";
import { Layout } from "antd";
import type { CSSProperties } from "react";
import { Outlet } from "react-router";

/**
 * Header、Content 和 Sider 是主布局使用的 Ant Design 结构组件。
 * 统一解构可以让 JSX 层级更清晰。
 */
const {Header, Content, Sider} = Layout;

/**
 * siderStyle 固定侧栏并保持视口高度和稳定滚动条空间。
 * 样式对象使用 React CSSProperties 执行属性类型检查。
 */
const siderStyle: CSSProperties = {
  height: "calc(100vh - 56px)",
  position: "sticky",
  insetInlineStart: 0,
  top: "56px",
  scrollbarWidth: "thin",
  scrollbarGutter: "stable",
};

/**
 * headerStyle 固定页头并保持在视口顶部。
 * 样式对象使用 React CSSProperties 执行属性类型检查。
 */
const headerStyle: CSSProperties = {
  padding: 0,
  position: "sticky",
  top: 0,
  zIndex: 1000,
};

/**
 * MainLayout 组合页头、侧栏和受保护页面内容区域。
 * 子路由通过 Outlet 渲染在主内容区域中。
 */
export default function MainLayout() {
  return (
    <Layout style={{minHeight: "100vh"}}>
      <Header style={headerStyle}>
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
