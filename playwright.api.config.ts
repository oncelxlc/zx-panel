import { defineConfig, devices } from "@playwright/test";

/** API 浏览器测试由 Go 隔离夹具提供前端与后端，不启动 MSW 或 Vite 代理。 */
export default defineConfig({
  testDir: "./tests/api-e2e",
  timeout: 45_000,
  workers: 1,
  reporter: "list",
  outputDir: "test-results-api",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:7202",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
