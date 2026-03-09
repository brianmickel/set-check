import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests for the Set Check frontend.
 * Run with: npm run e2e (from frontend/) or npm run e2e -w set-check-frontend (from root).
 * For full upload+analyze flow, start the worker: npm run dev:worker (port 8787).
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:5173/set-check/",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "default",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173/set-check/",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
