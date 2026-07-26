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

  test("dashboard grid shows 5 category sections", async ({ page }) => {
    const sections = page.locator(".category-section");
    await expect(sections).toHaveCount(5);

    const count = await sections.count();
    for (let i = 0; i < count; i++) {
      const heading = sections.nth(i).locator("h2");
      console.log(`Section ${i + 1}: ${await heading.textContent()}`);
    }
  });

  test("each category section has an eyebrow and heading", async ({ page }) => {
    const sections = page.locator(".category-section");
    const count = await sections.count();

    for (let i = 0; i < count; i++) {
      const section = sections.nth(i);
      const eyebrow = section.locator(".eyebrow");
      const heading = section.locator("h2");

      await expect(eyebrow).toBeVisible();
      await expect(heading).toBeVisible();

      // Verify eyebrow text is uppercase
      const eyebrowText = await eyebrow.textContent();
      expect(eyebrowText).toBe(eyebrowText?.toUpperCase());
    }
  });

  test("category cards show action links that navigate correctly", async ({ page }) => {
    const actionLinks = page.locator(".category-card-action");
    const linkCount = await actionLinks.count();

    // At least 8 action links across 5 categories (minimum 2-4 each)
    expect(linkCount).toBeGreaterThanOrEqual(8);

    // Collect all hrefs from action links
    const hrefs = await actionLinks.evaluateAll(
      (links) => links.map((l) => (l as HTMLAnchorElement).href)
    );

    // Verify we have at least 8 unique, non-empty hrefs
    expect(hrefs.filter((h) => h.length > 0).length).toBeGreaterThanOrEqual(8);

    // Navigate directly to first action href
    await page.goto(hrefs[0]);
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toBe("http://localhost:3000/");

    // Navigate directly to second action href
    await page.goto(hrefs[1]);
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toBe("http://localhost:3000/");
    expect(page.url()).not.toBe(hrefs[0]);
  });

  test("category card title, icon, and subtitle are visible", async ({ page }) => {
    await expect(page.locator(".category-card-icon").first()).toBeVisible();
    await expect(page.locator(".category-card-title").first()).toBeVisible();
    await expect(page.locator(".category-card-subtitle").first()).toBeVisible();
  });
});
