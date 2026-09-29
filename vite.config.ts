import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFile } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";

/** Vite 只把明确的静态资产加入 API 构建，演示模式单独启用 MSW。 */
export default defineConfig(({ command, mode }) => {
  const dataMode = process.env.VITE_DATA_MODE ?? loadEnv(mode, process.cwd()).VITE_DATA_MODE ?? "api";
  if (dataMode !== "api" && dataMode !== "mock") throw new Error("VITE_DATA_MODE must be api or mock");
  const productionAPI = command === "build" && dataMode === "api";
  return {
    publicDir: productionAPI ? false : "public",
    define: { "import.meta.env.VITE_DATA_MODE": JSON.stringify(dataMode) },
    plugins: [react(), tailwindcss(), {
      name: "panel-release-assets",
      /** API 包排除 Mock worker 与未引用的大图。 */
      async generateBundle() {
        if (!productionAPI) return;
        for (const name of ["theme-init.js", "icons/apple-touch-icon.png", "icons/favicon-32x32.png", "icons/favicon-16x16.png", "icons/favicon.ico", "icons/site.webmanifest", "icons/android-chrome-192x192.png", "icons/android-chrome-512x512.png", "login/login-bg-light.png", "login/login-bg-dart.png"]) {
          this.emitFile({ type: "asset", fileName: name, source: await readFile(new URL(`./public/${name}`, import.meta.url)) });
        }
      },
    }],
    server: {
      port: 7200,
      strictPort: true,
      proxy: { "/api": "http://127.0.0.1:25000" },
    },
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  };
});
