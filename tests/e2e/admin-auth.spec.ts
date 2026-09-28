/**
 * Regression tests for the /admin/* auth gate.
 *
 * f4a0dda replaced the HTTP Basic Auth gate (t_62fc9b28) with a
 * identity-based RBAC gate: proxy.ts now requires a signed identity with an
 * `admin:access` group on every /admin/* request. Without it the proxy redirects to the dashboard so users
 * never land on a raw JSON error page.
 *
 * These tests use deliberately NON-admin identities (no cookie, or a
 * cookie naming a role without admin:access) to prove the gate rejects
 * unauthenticated access. The authenticated admin path is covered by the
 * other admin e2e specs (admin-pages, admin-extended, server-action-smoke,
 * ...), which set the admin role cookie via helpers.setAdminRole().
 */
import { test, expect } from "@playwright/test";
import { setAdminRole } from "./helpers";

const ADMIN_PATHS = [
  "/admin",
  "/admin/client-config",
  "/admin/service-catalog",
  "/admin/attribute-options",
  "/admin/webhooks",
];

test.describe("admin auth gate", () => {
  test.describe("unauthenticated requests", () => {
    for (const path of ADMIN_PATHS) {
      test(`GET ${path} redirects to the dashboard without an admin role cookie`, async ({
        page,
      }) => {
        const response = await page.goto(path, {
          waitUntil: "domcontentloaded",
        });
        expect(response?.status()).toBe(200);
        await expect(page).toHaveURL(/\/$/);
      });
    }

    test("GET /admin/client-config redirects with a non-admin role cookie", async ({
      page,
    }) => {
      // A role that exists but lacks the admin:access permission must be
      // rejected just like an anonymous visitor.
      await page.context().addCookies([
        { name: "bcm_active_role", value: "change_manager", url: "http://localhost:3000" },
      ]);
      const response = await page.goto("/admin/client-config", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
      await expect(page).toHaveURL(/\/$/);
    });

    test("rejected requests do not render the JSON denial message", async ({
      page,
    }) => {
      const response = await page.goto("/admin/client-config", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
      await expect(page.getByText("Alleen een Beheerder kan beheerfuncties gebruiken.")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Welkom bij BCM" })).toBeVisible();
    });
  });

  test.describe("authenticated requests", () => {
    test("GET /admin/client-config returns 200 with a signed admin identity", async ({
      page,
    }) => {
      await setAdminRole(page);
      const response = await page.goto("/admin/client-config", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
    });
  });
});
