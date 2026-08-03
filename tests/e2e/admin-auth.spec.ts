/**
 * Regression tests for the /admin/* auth gate (t_62fc9b28).
 *
 * Before this change any anonymous request to /admin/* returned 200 with
 * the full admin payload and the admin server actions were invokable
 * without authentication. proxy.ts now requires HTTP Basic credentials
 * (ADMIN_USER / ADMIN_PASSWORD) on every /admin/* request.
 *
 * These tests use deliberately WRONG credentials to prove the gate
 * rejects unauthenticated access. The authenticated admin path is
 * covered by the existing admin e2e specs (admin-pages, admin-extended,
 * server-action-smoke, ...), which run with the valid credentials from
 * the Playwright `httpCredentials` config.
 */
import { test, expect } from "@playwright/test";

const ADMIN_PATHS = [
  "/admin",
  "/admin/change-types",
  "/admin/client-config",
  "/admin/attribute-options",
  "/admin/webhooks",
];

test.describe("admin auth gate", () => {
  test.describe("unauthenticated requests", () => {
    test.use({
      httpCredentials: { username: "wrong-user", password: "wrong-password" },
    });

    for (const path of ADMIN_PATHS) {
      test(`GET ${path} returns 401`, async ({ page }) => {
        const response = await page.goto(path, {
          waitUntil: "domcontentloaded",
        });
        expect(response?.status()).toBe(401);
      });
    }

    test("challenge header is present for browser credential prompt", async ({
      page,
    }) => {
      const response = await page.goto("/admin/change-types", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.headers()["www-authenticate"]).toMatch(/^Basic /);
    });
  });
});
