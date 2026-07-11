import {
  LockOutlined,
  LoginOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { ApiError, login } from "@/auth/api";
import type {
  LoginFormValues,
  LoginLocationState,
} from "@/types/auth.type";
import type { FormProps } from "antd";
import { Alert, Button, Card, Form, Input } from "antd";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import "./Login.scss";

/**
 * LoginPage 渲染账号密码表单并调用真实登录接口。
 * 登录成功后会安全返回鉴权守卫记录的原始访问路径。
 */
export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // 提交期间锁定按钮，并将服务端错误转换为页面内提示。
  const handleFinish: FormProps<LoginFormValues>["onFinish"] = async (values) => {
    setSubmitting(true);
    setErrorMessage("");
    try {
      await login(values.username, values.password);
      // 只允许站内绝对路径，避免登录后产生开放重定向。
      const requestedPath = (location.state as LoginLocationState | null)?.from;
      const target = typeof requestedPath === "string"
        && requestedPath.startsWith("/")
        && !requestedPath.startsWith("//")
        ? requestedPath
        : "/";
      navigate(target, {replace: true});
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : "登录失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
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
          {errorMessage && (
            <Alert
              className="login-page__error"
              showIcon
              title={errorMessage}
              type="error"
            />
          )}

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
            loading={submitting}
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
