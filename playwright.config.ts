import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ["html", { outputFolder: "playwright-report" }],
    ["list"],
  ],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    // /admin/* is gated by the cookie-based RBAC proxy (proxy.ts +
    // lib/rbac.ts): a request passes only when the `bcm_active_role`
    // cookie names a role with the `admin:access` permission. Admin
    // specs set that cookie via helpers.setAdminRole(); the HTTP Basic
    // Auth httpCredentials mechanism no longer gates /admin/* (the
    // f4a0dda refactor removed it from the route gate).
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    cwd: ".",
    // FEEDBACK_DRY_RUN: the feedback server action (app/feedback/actions.ts)
    // normally creates a real GitHub issue. Playwright cannot intercept that
    // server-side fetch, so every e2e run used to spam real issues. Always
    // run the dev server in dry-run mode: the feedback form exercises the
    // full success UI but never POSTs to api.github.com.
    env: { ...process.env, FEEDBACK_DRY_RUN: "true" },
  },
  globalSetup: "./tests/e2e/global-setup.ts",
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
