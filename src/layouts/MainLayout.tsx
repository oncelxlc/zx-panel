import { Layout } from "antd";
import { Outlet } from "react-router";

export default function MainLayout() {
  return (
    <Layout hasSider>
      <Outlet/>
    </Layout>
  );
}