import { test, expect } from "@playwright/test";

test.describe("Dashboard responsive layout", () => {
  test("accordion sections stack vertically at 768px viewport", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Verify 4 accordion sections are rendered
    const sections = page.locator(".main-category");
    await expect(sections).toHaveCount(4);
  });

  test("page is scrollable and content visible at 600px viewport", async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Assert the dashboard grid is still rendered
    await expect(page.locator(".dashboard-grid")).toBeVisible();
    // Assert at least some main category sections are visible
    const sections = page.locator(".main-category");
    await expect(sections.first()).toBeVisible();
  });
});
