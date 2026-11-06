import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import stylex from "@stylexjs/unplugin";

/** Vitest 只运行前端单元测试，保留原有 Node 内置测试入口。 */
export default defineConfig({
  plugins: [stylex.rollup({ runtimeInjection: true }), react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/unit/setup.ts"],
    clearMocks: true,
  },
  define: { "import.meta.env.VITE_DATA_MODE": JSON.stringify("mock") },
});
