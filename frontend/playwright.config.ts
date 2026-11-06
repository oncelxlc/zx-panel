import { defineConfig, devices } from "@playwright/test";

/** Playwright 使用独立端口的确定性 Mock，不操作开发库或宿主机应用。 */
export default defineConfig({ testDir: "./tests/e2e", outputDir: "test-results/e2e", timeout: 30_000, expect: { timeout: 10_000 }, fullyParallel: false, workers: 1, reporter: "list", use: { baseURL: "http://127.0.0.1:7201", trace: "retain-on-failure", screenshot: "only-on-failure", reducedMotion: "reduce" }, projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }], webServer: { command: "pnpm exec vite --mode mock --host 127.0.0.1 --port 7201", url: "http://127.0.0.1:7201", reuseExistingServer: false, timeout: 60_000 } });
