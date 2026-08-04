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
    // /admin/* is gated by HTTP Basic Auth (proxy.ts). The dev server
    // (webServer below) must run with the same ADMIN_USER/ADMIN_PASSWORD
    // — set them in .env.local (see .env.example) or the job env.
    // CI uses the secrets with a literal fallback so the non-DB e2e
    // suite (including the admin specs) stays runnable on any machine.
    httpCredentials: {
      username: process.env.ADMIN_USER ?? "ci-admin",
      password: process.env.ADMIN_PASSWORD ?? "ci-admin-password",
    },
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    cwd: ".",
  },
  globalSetup: "./tests/e2e/global-setup.ts",
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
