/**
 * Regression tests for the /admin/* auth gate.
 *
 * f4a0dda replaced the HTTP Basic Auth gate (t_62fc9b28) with a
 * cookie-based RBAC gate: proxy.ts now requires the `bcm_active_role`
 * cookie to hold a role with the `admin:access` permission on every
 * /admin/* request. Without it the proxy answers 403 with a JSON error
 * and the admin page never renders.
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
  "/admin/change-types",
  "/admin/client-config",
  "/admin/attribute-options",
  "/admin/webhooks",
];

test.describe("admin auth gate", () => {
  test.describe("unauthenticated requests", () => {
    for (const path of ADMIN_PATHS) {
      test(`GET ${path} returns 403 without an admin role cookie`, async ({
        page,
      }) => {
        const response = await page.goto(path, {
          waitUntil: "domcontentloaded",
        });
        expect(response?.status()).toBe(403);
      });
    }

    test("GET /admin/change-types returns 403 with a non-admin role cookie", async ({
      page,
    }) => {
      // A role that exists but lacks the admin:access permission must be
      // rejected just like an anonymous visitor.
      await page.context().addCookies([
        { name: "bcm_active_role", value: "change_manager", url: "http://localhost:3000" },
      ]);
      const response = await page.goto("/admin/change-types", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(403);
    });

    test("rejected requests render the JSON denial message, not the admin page", async ({
      page,
    }) => {
      const response = await page.goto("/admin/change-types", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(403);
      await expect(page.locator(".eyebrow")).toHaveCount(0);
    });
  });

  test.describe("authenticated requests", () => {
    test("GET /admin/change-types returns 200 with an admin role cookie", async ({
      page,
    }) => {
      await setAdminRole(page);
      const response = await page.goto("/admin/change-types", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
    });
  });
});
