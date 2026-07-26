import { test, expect } from "@playwright/test";

test.describe("Dashboard responsive layout", () => {
  test("category card grid stacks in single column at 768px viewport", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const grid = page.locator(".category-card-grid").first();
    await expect(grid).toHaveCSS("grid-template-columns", "1fr");
  });

  test("page is scrollable and content visible at 600px viewport", async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Assert the dashboard grid is still rendered
    await expect(page.locator(".dashboard-grid")).toBeVisible();
    // Assert at least some category sections are visible (may need scroll)
    const sections = page.locator(".category-section");
    await expect(sections.first()).toBeVisible();
  });
});
