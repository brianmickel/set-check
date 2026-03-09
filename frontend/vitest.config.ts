import { defineConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default defineConfig({
  ...viteConfig,
  test: {
    globals: false,
    environment: "node",
    exclude: ["**/node_modules/**", "**/e2e/**"],
  },
});
