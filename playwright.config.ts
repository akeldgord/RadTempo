import { defineConfig, devices } from "@playwright/test";

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgres://radtempo:radtempo@localhost:5432/radtempo_e2e";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: process.env.APP_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
          : {},
      },
    },
  ],
  webServer: {
    command: "pnpm build && pnpm start",
    url: process.env.APP_URL ?? "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      AUTH_SECRET:
        process.env.AUTH_SECRET ??
        "e2e-test-secret-not-for-production-use-only",
      APP_URL: process.env.APP_URL ?? "http://localhost:3000",
      REGISTRATION_MODE: process.env.REGISTRATION_MODE ?? "invite_only",
      SETUP_TOKEN:
        process.env.SETUP_TOKEN ??
        "e2e-setup-token-not-for-production-use-only",
      NODE_ENV: "production",
    },
  },
});
