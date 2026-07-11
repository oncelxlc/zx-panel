import { AppstoreOutlined, MailOutlined, SettingOutlined } from "@ant-design/icons";
import type { MenuItem } from "@/types/navigation.type";
import { Menu, type MenuProps } from "antd";

/**
 * items 描述当前主侧栏的分组、子菜单和占位导航项。
 * 配置使用 Ant Design 原生菜单项类型保证结构合法。
 */
const items: MenuItem[] = [
  {
    key: "sub1",
    label: "Navigation One",
    icon: <MailOutlined/>,
    children: [
      {
        key: "g1",
        label: "Item 1",
        type: "group",
        children: [
          {key: "1", label: "Option 1"},
          {key: "2", label: "Option 2"},
        ],
      },
      {
        key: "g2",
        label: "Item 2",
        type: "group",
        children: [
          {key: "3", label: "Option 3"},
          {key: "4", label: "Option 4"},
        ],
      },
    ],
  },
  {
    key: "sub2",
    label: "Navigation Two",
    icon: <AppstoreOutlined/>,
    children: [
      {key: "5", label: "Option 5"},
      {key: "6", label: "Option 6"},
      {
        key: "sub3",
        label: "Submenu",
        children: [
          {key: "7", label: "Option 7"},
          {key: "8", label: "Option 8"},
        ],
      },
    ],
  },
  {
    type: "divider",
  },
  {
    key: "sub4",
    label: "Navigation Three",
    icon: <SettingOutlined/>,
    children: [
      {key: "9", label: "Option 9"},
      {key: "10", label: "Option 10"},
      {key: "11", label: "Option 11"},
      {key: "12", label: "Option 12"},
    ],
  },
  {
    key: "grp",
    label: "Group",
    type: "group",
    children: [
      {key: "13", label: "Option 13"},
      {key: "14", label: "Option 14"},
    ],
  },
];

/**
 * MainSider 渲染主布局的可滚动导航菜单。
 * 当前点击处理保留调试输出，后续可接入真实路由。
 */
export function MainSider() {
  // 菜单尚未绑定业务路由，暂时记录点击信息便于开发调试。
  const onClick: MenuProps["onClick"] = (e) => {
    console.log("click ", e);
  };

  return (
    <Menu
      onClick={onClick}
      style={{width: "100%"}}
      defaultSelectedKeys={["1"]}
      defaultOpenKeys={["sub1"]}
      mode="inline"
      items={[...items, ...items, ...items]}
    />
  );
}
