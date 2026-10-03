import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 车间演示时：`npm run dev:web` 起前端（62009），API 代理到同步服务器 6210。
// 生产/单机用法：`npm start` 构建后由 Node 服务器同时托管页面与 API（62009）。
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 62009,
    proxy: {
      "/api": "http://localhost:6210",
      "/photos": "http://localhost:6210",
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 62009,
  },
});
