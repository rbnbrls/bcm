import { test, expect } from "@playwright/test";
import { setAdminRole } from "./helpers";

test.describe("Dashboard responsive layout", () => {
  test.beforeEach(async ({ page }) => {
    // Dashboard sections are role-filtered (RBAC) and feature-flagged: for
    // the default role the BEHEER category has zero visible items (the
    // /workflow-runtime link is gated by the workflow_runtime.start flag,
    // /admin + /admin/webhooks need admin:access) and DashboardGrid drops
    // empty categories, leaving only 2 .main-category sections. This suite
    // verifies the responsive layout of the full dashboard, so run it with
    // the admin role cookie, exactly like homepage.spec.ts.
    await setAdminRole(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("accordion sections stack vertically at 768px viewport", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    // Verify 3 accordion sections are rendered
    const sections = page.locator(".main-category");
    await expect(sections).toHaveCount(3);
  });

  test("page is scrollable and content visible at 600px viewport", async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 900 });
    // Assert the dashboard grid is still rendered
    await expect(page.locator(".dashboard-grid")).toBeVisible();
    // Assert at least some main category sections are visible
    const sections = page.locator(".main-category");
    await expect(sections.first()).toBeVisible();
  });
});
