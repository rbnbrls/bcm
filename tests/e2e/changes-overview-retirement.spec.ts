import { test, expect } from "@playwright/test";

test.describe("Retired changes overview", () => {
  test("bare /changes no longer exposes the old dashboard", async ({ page }) => {
    await page.goto("/changes");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toContainText("We kunnen deze pagina niet vinden");
    await expect(page.locator("#filter-status")).toHaveCount(0);
    await expect(page.locator("#filter-sla")).toHaveCount(0);
    await expect(page.locator('nav[aria-label="Hoofdnavigatie"] a[href="/changes"]')).toHaveCount(0);
  });
});
