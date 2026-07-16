import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { E2E_DATABASE_PATH, E2E_MEDIA_ROOT } from "./e2e/support/test-paths";

const repositoryRoot = path.resolve(__dirname, "..");
const serviceKey = "playwright-service-key";

export default defineConfig({
  expect: { timeout: 10_000 },
  forbidOnly: true,
  fullyParallel: false,
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  outputDir: "test-results",
  projects: [
    {
      name: "chromium-desktop",
      testMatch: ["**/*.desktop.spec.ts", "**/site-regression.spec.ts", "**/visual-layout.spec.ts"],
      use: { ...devices["Desktop Chrome"], viewport: { height: 900, width: 1440 } },
    },
    {
      name: "chromium-mobile-390x844",
      testMatch: "**/*.mobile.spec.ts",
      use: {
        browserName: "chromium",
        hasTouch: true,
        isMobile: true,
        viewport: { height: 844, width: 390 },
      },
    },
    {
      name: "chromium-reduced-motion",
      testMatch: "**/reduced-motion.spec.ts",
      use: {
        browserName: "chromium",
        hasTouch: true,
        isMobile: true,
        viewport: { height: 844, width: 390 },
      },
    },
  ],
  reporter: "line",
  retries: 0,
  testDir: "./e2e",
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: ".venv/bin/uvicorn sense_engine.api.app:app --host 127.0.0.1 --port 8000",
      cwd: repositoryRoot,
      env: {
        SENSE_ENGINE_ENV: "test",
        SENSE_ENGINE_SERVICE_KEY: serviceKey,
      },
      reuseExistingServer: false,
      timeout: 30_000,
      url: "http://127.0.0.1:8000/health/live",
    },
    {
      command: "npm run dev -- --hostname 127.0.0.1 --port 3000",
      cwd: __dirname,
      env: {
        ADMIN_EMAIL: "playwright-admin@senseorder.test",
        ADMIN_PASSWORD: "playwright-admin-password",
        DATABASE_PATH: E2E_DATABASE_PATH,
        MEDIA_ROOT: E2E_MEDIA_ROOT,
        SENSE_ENGINE_PRIVATE_URL: "http://127.0.0.1:8000",
        SENSE_ENGINE_SERVICE_KEY: serviceKey,
        SESSION_SECRET: "playwright-session-secret",
      },
      reuseExistingServer: false,
      timeout: 60_000,
      url: "http://127.0.0.1:3000/api/health",
    },
  ],
  workers: 1,
});
