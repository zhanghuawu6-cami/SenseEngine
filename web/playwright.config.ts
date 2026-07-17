import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { readE2EPaths } from "./e2e/support/test-paths";

const repositoryRoot = path.resolve(__dirname, "..");
const serviceKey = "playwright-service-key";
const paths = readE2EPaths();

function readPort(name: "SENSEORDER_E2E_API_PORT" | "SENSEORDER_E2E_WEB_PORT"): number {
  const raw = process.env[name];
  const port = Number(raw);
  if (!raw || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer TCP port`);
  }
  return port;
}

const apiPort = readPort("SENSEORDER_E2E_API_PORT");
const webPort = readPort("SENSEORDER_E2E_WEB_PORT");
if (apiPort === webPort) throw new Error("Playwright API and Web ports must differ");
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const webOrigin = `http://127.0.0.1:${webPort}`;

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
    baseURL: webOrigin,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `.venv/bin/uvicorn sense_engine.api.app:app --host 127.0.0.1 --port ${apiPort}`,
      cwd: repositoryRoot,
      env: {
        SENSE_ENGINE_ENV: "test",
        SENSE_ENGINE_SERVICE_KEY: serviceKey,
      },
      reuseExistingServer: false,
      timeout: 30_000,
      url: `${apiOrigin}/health/live`,
    },
    {
      command: `npm run build && npm run start`,
      cwd: __dirname,
      env: {
        ADMIN_EMAIL: "playwright-admin@senseorder.test",
        ADMIN_PASSWORD: "playwright-admin-password",
        DATABASE_PATH: paths.databasePath,
        HOSTNAME: "127.0.0.1",
        MEDIA_ROOT: paths.mediaRoot,
        NEXT_TELEMETRY_DISABLED: "1",
        PORT: String(webPort),
        SENSE_ENGINE_PRIVATE_URL: apiOrigin,
        SENSE_ENGINE_SERVICE_KEY: serviceKey,
        SESSION_SECRET: "playwright-session-secret",
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: `${webOrigin}/api/health`,
    },
  ],
  workers: 1,
});
