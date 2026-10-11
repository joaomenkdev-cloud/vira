import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = 3101;
// The port the web app proxies to by default (see src/config/api-origin.ts): the rewrite is
// fixed when the app is built, so the stand-in API listens exactly there.
const FAKE_API_PORT = 3000;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env["CI"]),
  // No retries: a flaky test is a bug to fix, not to hide.
  retries: 0,
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      // Stands in for the real API, so the /api/v1 proxy can be exercised in a browser.
      command: "node e2e/fake-api.mjs",
      env: { PORT: String(FAKE_API_PORT) },
      url: `http://127.0.0.1:${FAKE_API_PORT}/api/v1/health/live`,
      reuseExistingServer: !process.env["CI"],
    },
    {
      // Requires `next build` to have run (CI does; locally: pnpm --filter @vira/web build).
      command: `pnpm exec next start --port ${WEB_PORT}`,
      // Serves /dev/design-system from the production build (src/config/design-system.ts).
      env: { VIRA_DESIGN_SYSTEM: "true" },
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
    },
  ],
});
