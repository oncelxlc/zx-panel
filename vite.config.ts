import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 6500,
    strictPort: true, // 端口被占用时直接报错，不自动尝试下一个可用端口
    proxy: {
      "/api": "http://127.0.0.1:25000",
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
