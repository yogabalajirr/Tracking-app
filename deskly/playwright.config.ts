import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a real build, a real Postgres and real email
 * delivery through the console driver — no mocks. `npm run seed` must have run
 * first; the tests create their own workspaces where they need isolation and
 * lean on the demo workspace where they don't.
 */

const PORT = Number(process.env.E2E_PORT ?? 3210);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // Tickets are workspace-global state; parallel writes across files would
  // make counts and "the newest ticket" assertions flaky.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Set when the environment ships a Chromium that Playwright did not
        // download itself (CI images, sandboxes).
        ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
          : {}),
      },
    },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run build && PORT=${PORT} npm run start`,
        url: `${baseURL}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
