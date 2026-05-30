import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl =
  process.env.ADMIN_E2E_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || "";
const port = Number(process.env.PLAYWRIGHT_PORT || process.env.PORT || 3000);
const baseURL = externalBaseUrl || `http://127.0.0.1:${port}`;
const startWebServer =
  !externalBaseUrl && process.env.PLAYWRIGHT_SKIP_WEB_SERVER !== "1";

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  reporter: [["list"]],
  retries: process.env.CI ? 1 : 0,
  testDir: "./test/e2e",
  timeout: 60_000,
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: startWebServer
    ? {
        command: `npm run start -- -H 127.0.0.1 -p ${port}`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        url: baseURL
      }
    : undefined,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
