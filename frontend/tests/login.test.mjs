import assert from "node:assert/strict";
import test from "node:test";
import { getLoginTarget, validateLoginForm } from "../src/auth/loginForm.ts";

test("账号校验覆盖空值、长度边界和允许字符", () => {
  for (const username of [
    "",
    "ab",
    "a".repeat(33),
    "admin user",
    " admin",
    "管理员",
    "<admin>",
  ]) {
    assert.ok(
      validateLoginForm({ username, password: "secret123" }).username,
      username,
    );
  }
  for (const username of ["abc", "a".repeat(32), "Admin_01.test-name"]) {
    assert.deepEqual(
      validateLoginForm({ username, password: "secret123" }),
      {},
    );
  }
});

test("密码按 Unicode 字符计数，允许 33–72 位且不裁剪输入", () => {
  for (const password of [
    "",
    "12345",
    "x".repeat(73),
    "😀".repeat(5),
    "密".repeat(73),
  ]) {
    assert.ok(validateLoginForm({ username: "admin", password }).password);
  }
  for (const password of [
    "123456",
    "x".repeat(32),
    "x".repeat(33),
    "x".repeat(72),
    "😀".repeat(6),
    "😀".repeat(72),
    " 1234 ",
  ]) {
    const values = { username: "admin", password };
    assert.deepEqual(validateLoginForm(values), {});
    assert.equal(values.password, password);
  }
});

test("安全回跳保留站内路径、查询和锚点，拒绝 URL 规范化绕过", () => {
  const origin = "https://panel.example";
  for (const path of [
    undefined,
    null,
    {},
    42,
    "",
    "dashboard",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/\n/evil.example",
    "/a/..//evil.example",
  ]) {
    assert.equal(getLoginTarget(path, origin), "/", String(path));
  }
  for (const path of [
    "/",
    "/?tab=overview#details",
    "/settings?next=https%3A%2F%2Fevil.example#account",
  ]) {
    assert.equal(getLoginTarget(path, origin), path);
  }
  assert.equal(
    getLoginTarget("/a/../settings?tab=1#profile", origin),
    "/settings?tab=1#profile",
  );
});
