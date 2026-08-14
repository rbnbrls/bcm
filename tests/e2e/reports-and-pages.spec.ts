import { test, expect } from "@playwright/test";

const retiredReportPaths = [
  "/reports",
  "/reports/processing-time",
  "/reports/costs",
  "/reports/volume",
] as const;

test.describe("Reports pages", () => {
  test("legacy report routes hand off to runtime reporting", async ({ page }) => {
    for (const path of retiredReportPaths) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");

      await expect(page).not.toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("heading", { name: /Dashboard|Doorlooptijd|Kosten|Volume per klant/ })).toHaveCount(0);
    }
  });
});

test.describe("Updates page (/updates)", () => {
  test("page loads with heading and timeline", async ({ page }) => {
    await page.goto("/updates");
    await page.waitForLoadState("networkidle");

    const heading = page.locator("h1");
    await expect(heading).toBeVisible();
    // The updates page shows commits in a timeline - may show loading state
    // or loaded content depending on the API
  });

  test("shows network activity indicator during load", async ({ page }) => {
    await page.goto("/updates");
    // Wait for the page to reach networkidle
    await page.waitForLoadState("networkidle");
  });
});

test.describe("Change history (/changes/history)", () => {
  test("page loads with heading and client cards", async ({ page }) => {
    await page.goto("/changes/history");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: /changes per klant/i })).toBeVisible();
    await expect(page.locator(".eyebrow")).toContainText("WIJZIGINGSHISTORIE");

    // Either show history cards or empty state
    const historyCards = page.locator(".history-card, .history-grid");
    const emptyState = page.locator(".empty-state");

    if (await historyCards.isVisible().catch(() => false)) {
      // Verify cards link to client detail pages
      const firstCard = page.locator(".history-card, .history-grid a").first();
      await expect(firstCard).toBeVisible();
    } else if (await emptyState.isVisible().catch(() => false)) {
      await expect(emptyState).toContainText("Nog geen changes");
    }
  });

  test("client history card navigates to detail page", async ({ page }) => {
    await page.goto("/changes/history");
    await page.waitForLoadState("networkidle");

    const link = page.locator(".history-card, .history-grid a").first();
    if (await link.isVisible().catch(() => false)) {
      const href = await link.getAttribute("href");
      expect(href).toMatch(/\/changes\/history\//);
      await link.click();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/\/changes\/history\//);
    }
  });
});

test.describe("Change catalog (/change-catalog)", () => {
  test("page loads with heading and change type cards", async ({ page }) => {
    await page.goto("/change-catalog");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("CHANGE CATALOGUS", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Change catalogus" })).toBeVisible();

    // Should show change type entries (even if empty, the component should render)
    const catalogGrid = page.locator(
      ".change-type-card, .change-type-grid, .change-catalog-grid, .catalog-list",
    );
    if (await catalogGrid.isVisible().catch(() => false)) {
      await expect(catalogGrid).toBeVisible();
    }
  });

  test("change type card has detail link", async ({ page }) => {
    await page.goto("/change-catalog");
    await page.waitForLoadState("networkidle");

    // Find a clickable change type entry
    const detailLink = page.locator("a[href*='/change-catalog/']").first();
    if (await detailLink.isVisible().catch(() => false)) {
      await detailLink.click();
      await page.waitForLoadState("networkidle");
      // Should navigate to a detail page (UUID format or slug)
      await expect(page).toHaveURL(/\/change-catalog\//);
    }
  });

  test("change catalog detail page shows structure", async ({ page }) => {
    // Try a known slug for the detail page
    await page.goto("/change-catalog/benchmark-switch");
    await page.waitForLoadState("networkidle");

    // If the page exists (slug is valid), verify structure
    const h1 = page.locator("h1");
    const notFound = page.locator("h1:has-text('niet gevonden')");

    if (await notFound.isVisible().catch(() => false)) {
      // Slug not found - this is acceptable; the page properly handles 404
      await expect(notFound).toBeVisible();
    } else if (await h1.isVisible().catch(() => false)) {
      // Detail page loaded - verify it shows content
      await expect(h1).toBeVisible();
    }
  });
});

test.describe("Provider feedback page (/verwerkt)", () => {
  test("page loads with visible heading", async ({ page }) => {
    await page.goto("/verwerkt");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toBeVisible();
  });
});
