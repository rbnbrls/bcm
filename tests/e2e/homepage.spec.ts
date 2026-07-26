import { test, expect } from "@playwright/test";

test.describe("Dashboard homepage", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("hero section shows DASHBOARD eyebrow and welcome heading", async ({ page }) => {
    await expect(page.locator(".hero .eyebrow")).toContainText("DASHBOARD");
    await expect(page.locator("h1")).toContainText("Welkom bij BCM");
    await expect(page.locator(".hero-copy")).toBeVisible();

    const cta = page.locator(`.hero a[href="/changes/new"]`);
    await expect(cta).toContainText("Change aanvragen →");
  });

  test("dashboard shows 4 main accordion sections instead of 5 flat categories", async ({ page }) => {
    const sections = page.locator(".main-category");
    await expect(sections).toHaveCount(4);

    const headings = [
      "Nieuwe klant",
      "Nieuwe change",
      "Monitoren & verwerken",
      "Beheer",
    ];

    const count = await sections.count();
    for (let i = 0; i < count; i++) {
      const heading = sections.nth(i).locator(".main-category-title");
      await expect(heading).toContainText(headings[i]);
    }
  });

  test("categories start collapsed — no sub-items visible initially", async ({ page }) => {
    const panels = page.locator(".accordion-panel");
    const count = await panels.count();
    for (let i = 0; i < count; i++) {
      await expect(panels.nth(i)).not.toBeVisible();
    }
  });

  test("clicking a category header expands its sub-items", async ({ page }) => {
    const firstHeader = page.locator(".main-category").first().locator(".main-category-header");
    await firstHeader.click();

    const firstPanel = page.locator(".accordion-panel").first();
    await expect(firstPanel).toBeVisible();
    await expect(firstPanel.locator("a").first()).toBeVisible();
  });

  test("clicking the same header again collapses", async ({ page }) => {
    const firstHeader = page.locator(".main-category").first().locator(".main-category-header");
    await firstHeader.click();
    await expect(page.locator(".accordion-panel").first()).toBeVisible();

    await firstHeader.click();
    await expect(page.locator(".accordion-panel").first()).not.toBeVisible();
  });

  test("all 17 action links exist across the 4 categories", async ({ page }) => {
    // Count total action links regardless of expanded state
    const actionLinks = page.locator(".category-action-link");
    await expect(actionLinks).toHaveCount(17);

    // Verify some key links exist
    await expect(page.locator(`.category-action-link[href="/changes/new"]`)).toBeVisible();
    await expect(page.locator(`.category-action-link[href="/admin/client-config"]`)).toBeVisible();
    await expect(page.locator(`.category-action-link[href="/admin"]`)).toBeVisible();
    await expect(page.locator(`.category-action-link[href="/reports"]`)).toBeVisible();
  });

  test("category header shows icon and label for each main category", async ({ page }) => {
    const sections = page.locator(".main-category");
    const count = await sections.count();
    for (let i = 0; i < count; i++) {
      const header = sections.nth(i).locator(".main-category-header");
      // Should have an icon SVG and a title
      await expect(header.locator("svg").first()).toBeVisible();
      await expect(header.locator(".main-category-title")).toBeVisible();
    }
  });
});
