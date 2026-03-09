import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  base: "/set-check/",
  plugins: [react()],
  server: {
    proxy: {
      // In dev: proxy /api to Cloudflare Worker (npm run dev:worker → port 8787).
      // Worker provides session, upload, analyze. For Express backend use port 3000.
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
});
