import { test, expect } from "@playwright/test";

test.describe("Global UI elements", () => {
  test.describe("Feedback modal", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");
    });

    test("floating feedback trigger button is visible", async ({ page }) => {
      const trigger = page.locator(".feedback-trigger");
      await expect(trigger).toBeVisible();
      await expect(trigger).toHaveAttribute("aria-label", "Feedback geven");
    });

    test("clicking trigger opens modal with form", async ({ page }) => {
      await page.locator(".feedback-trigger").click();
      const modal = page.locator(".feedback-modal--open");
      await expect(modal).toBeVisible();
      await expect(modal.locator(`input[name="title"]`)).toBeVisible();
      await expect(modal.locator(`textarea[name="body"]`)).toBeVisible();
      await expect(modal.locator("button[type='submit']")).toContainText("Verstuur feedback");
    });

    test("modal can be closed via close button", async ({ page }) => {
      await page.locator(".feedback-trigger").click();
      await expect(page.locator(".feedback-modal--open")).toBeVisible();
      await page.locator(".feedback-close").click();
      await expect(page.locator(".feedback-modal--open")).not.toBeVisible();
    });

    test("modal can be closed via backdrop click", async ({ page }) => {
      await page.locator(".feedback-trigger").click();
      await expect(page.locator(".feedback-modal--open")).toBeVisible();
      await page.locator(".feedback-backdrop").click();
      await expect(page.locator(".feedback-modal--open")).not.toBeVisible();
    });
  });

  test.describe("Navigation links", () => {
    test("navigation links are visible in the header", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      const nav = page.locator("nav a, header a");
      const links = await nav.allInnerTexts();
      const found = links.some((l) => l.toLowerCase().includes("changes"));
      expect(found).toBeTruthy();
    });

    test("navigation links are present on other pages too", async ({ page }) => {
      await page.goto("/benchmarks");
      await page.waitForLoadState("networkidle");
      const nav = page.locator("nav a, header a");
      const linkCount = await nav.count();
      expect(linkCount).toBeGreaterThanOrEqual(3);
    });
  });

  test.describe("404 page", () => {
    test("shows not found page with navigation buttons", async ({ page }) => {
      await page.goto("/this-page-does-not-exist-12345");
      await page.waitForLoadState("networkidle");
      await expect(page.locator("h1")).toContainText("niet gevonden");
      await expect(page.locator(`a[href="/changes/new"]`).last()).toContainText("Nieuwe change");
      await expect(page.locator(`a[href="/"]`).last()).toContainText("Naar home");
    });

    test("'Nieuwe change' link on 404 page navigates to change form", async ({ page }) => {
      await page.goto("/this-page-does-not-exist-12345");
      await page.waitForLoadState("networkidle");
      await page.locator(`a[href="/changes/new"]`).last().click();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/\/changes\/new/);
    });

    test("'Naar home' link on 404 page navigates to homepage", async ({ page }) => {
      await page.goto("/nonexistent-route");
      await page.waitForLoadState("networkidle");
      await page.locator(`a[href="/"]`).last().click();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/\/$/);
    });
  });
});
