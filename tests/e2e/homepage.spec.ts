import { test, expect } from "@playwright/test";
import { setAdminRole } from "./helpers";

test.describe("Dashboard homepage", () => {
  test.beforeEach(async ({ page }) => {
    // Dashboard action links are role-filtered (RBAC): the full set of 17
    // links only renders for a role with admin:access, while the default
    // role sees 14 (the three /admin/* links are hidden). This suite
    // verifies the complete dashboard, so run it with the admin role cookie.
    await setAdminRole(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("hero section shows DASHBOARD eyebrow, welcome heading and instruction text", async ({ page }) => {
    await expect(page.locator(".hero .eyebrow")).toContainText("DASHBOARD");
    await expect(page.locator("h1")).toContainText("Welkom bij BCM");
    // Old .hero-copy has been replaced by .hero-instruction
    // Instruction text should appear under the Welkom heading
    await expect(page.locator(".hero-instruction")).toBeVisible();
  });

  test("Change aanvragen button is no longer present", async ({ page }) => {
    await expect(page.locator(`.hero a[href="/changes/new"]`)).toHaveCount(0);
  });

  test("dashboard shows 3 main accordion sections after removing NIEUWE KLANT", async ({ page }) => {
    const sections = page.locator(".main-category");
    await expect(sections).toHaveCount(3);

    const headings = [
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

  test("NIEUWE KLANT category is no longer present", async ({ page }) => {
    await expect(page.locator(".main-category-title").filter({ hasText: "Nieuwe klant" })).toHaveCount(0);
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

  test("all 17 action links exist across the 3 categories", async ({ page }) => {
    // Count total action links regardless of expanded state
    const actionLinks = page.locator(".category-action-link");
    await expect(actionLinks).toHaveCount(17);

    // Verify some key links still exist
    // (catalog-first flow: "Change aanvragen →" now points to /change-catalog,
    // which two actions share — use .first() to avoid strict-mode violation)
    await expect(page.locator(`.category-action-link[href="/change-catalog"]`).first()).toBeVisible();
    await expect(page.locator(`.category-action-link[href="/admin"]`)).toBeVisible();
    await expect(page.locator(`.category-action-link[href="/reports"]`)).toBeVisible();

    // Verify new lookup-request links are present (regression coverage)
    await expect(page.locator(`.category-action-link[href="/asset-class-aanvraag"]`)).toBeVisible();
    await expect(page.locator(`.category-action-link[href="/sub-asset-class-aanvraag"]`)).toBeVisible();

    // Verify NIEUWE KLANT links are gone
    await expect(page.locator(`.category-action-link[href="/onboarding/new"]`)).toHaveCount(0);
    await expect(page.locator(`.category-action-link[href="/admin/client-config"]`)).toHaveCount(0);
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
