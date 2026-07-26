import { test, expect } from "@playwright/test";

test.describe("Dashboard homepage", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("hero section shows DASHBOARD eyebrow and welcome heading", async ({ page }) => {
    await expect(page.locator(".eyebrow")).toContainText("DASHBOARD");
    await expect(page.locator("h1")).toContainText("Welkom bij BCM");
    await expect(page.locator(".hero-copy")).toBeVisible();

    const cta = page.locator(`a[href="/changes/new"]`);
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

    // Click first action link, verify navigation
    await actionLinks.first().click();
    await page.waitForLoadState("networkidle");
    const firstUrl = page.url();
    expect(firstUrl).not.toBe("http://localhost:3000/");

    // Navigate back and click second action link
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await actionLinks.nth(1).click();
    await page.waitForLoadState("networkidle");
    const secondUrl = page.url();
    expect(secondUrl).not.toBe("http://localhost:3000/");
    expect(secondUrl).not.toBe(firstUrl);
  });

  test("category card title, icon, and subtitle are visible", async ({ page }) => {
    await expect(page.locator(".category-card-icon").first()).toBeVisible();
    await expect(page.locator(".category-card-title").first()).toBeVisible();
    await expect(page.locator(".category-card-subtitle").first()).toBeVisible();
  });
});
