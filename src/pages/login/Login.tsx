import {
  LockOutlined,
  LoginOutlined,
  UserOutlined,
} from "@ant-design/icons";
import type { FormProps } from "antd";
import { Button, Card, Form, Input } from "antd";
import { useNavigate } from "react-router";
import "./Login.scss";

type LoginFormValues = {
  username: string;
  password: string;
};

export function LoginPage() {
  const navigate = useNavigate();

  const handleFinish: FormProps<LoginFormValues>["onFinish"] = () => {
    navigate("/", {replace: true});
  };

  return (
    <main className="login-page">
      <Card className="login-page__card" variant="outlined">
        <div className="login-page__card-header">
          <p className="login-page__card-eyebrow">Account</p>
          <h2>登录</h2>
        </div>

        <Form<LoginFormValues>
          className="login-page__form"
          name="login"
          layout="vertical"
          autoComplete="off"
          requiredMark={false}
          onFinish={handleFinish}
        >
          <Form.Item<LoginFormValues>
            label="账号"
            name="username"
            rules={[
              {required: true, whitespace: true, message: "请输入账号"},
              {min: 3, message: "账号至少 3 个字符"},
              {max: 32, message: "账号不能超过 32 个字符"},
              {
                pattern: /^[A-Za-z0-9_.-]+$/,
                message: "账号仅支持字母、数字、下划线、点和短横线",
              },
            ]}
          >
            <Input
              allowClear
              autoComplete="username"
              prefix={<UserOutlined/>}
              size="large"
              placeholder="admin"
            />
          </Form.Item>

          <Form.Item<LoginFormValues>
            label="密码"
            name="password"
            rules={[
              {required: true, message: "请输入密码"},
              {min: 6, message: "密码至少 6 个字符"},
              {max: 32, message: "密码不能超过 32 个字符"},
            ]}
          >
            <Input.Password
              autoComplete="current-password"
              prefix={<LockOutlined/>}
              size="large"
              placeholder="请输入密码"
            />
          </Form.Item>

          <Button
            block
            htmlType="submit"
            icon={<LoginOutlined/>}
            size="large"
            type="primary"
          >
            登录
          </Button>
        </Form>
      </Card>
    </main>
  );
}
