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
    test("navigation hides Beheer for non-admin profiles", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      const nav = page.locator("nav[aria-label='Hoofdnavigatie'] a");
      // Non-admin (change_manager) sees Dashboard, Wijzigingen, Workflow
      // Studio (workflow:view + builder flag on) and Rapportages — but never
      // the Beheer (/admin) link.
      await expect(nav).toHaveCount(4);
      await expect(nav.nth(0)).toHaveText("Dashboard");
      await expect(nav.nth(1)).toHaveText("Wijzigingen");
      await expect(nav.nth(2)).toHaveText("Workflow Studio");
      await expect(nav.nth(3)).toHaveText("Rapportages");
      await expect(page.locator("nav[aria-label='Hoofdnavigatie'] a[href='/admin']")).toHaveCount(0);
    });

    test("active nav item has aria-current attribute", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      // Dashboard should be active on /
      const dashboardLink = page.locator("nav[aria-label='Hoofdnavigatie'] a[href='/']");
      await expect(dashboardLink).toHaveAttribute("aria-current", "page");
    });

    test("Wijzigingen is active on /changes page", async ({ page }) => {
      await page.goto("/changes");
      await page.waitForLoadState("networkidle");
      const wijzigingenLink = page.locator("nav[aria-label='Hoofdnavigatie'] a[href='/changes']");
      await expect(wijzigingenLink).toHaveAttribute("aria-current", "page");
    });
  });

  test.describe("404 page", () => {
    test("shows not found page with navigation buttons", async ({ page }) => {
      await page.goto("/this-page-does-not-exist-12345");
      await page.waitForLoadState("networkidle");
      await expect(page.locator("h1")).toContainText(
        "We kunnen deze pagina niet vinden",
      );
      await expect(page.locator(`a[href="/changes/new"]`).last()).toContainText("Nieuwe change");
      await expect(page.locator(`a[href="/changes"]`).last()).toContainText("Naar changes");
    });

    test("'Nieuwe change' link on 404 page navigates to change form", async ({ page }) => {
      await page.goto("/this-page-does-not-exist-12345");
      await page.waitForLoadState("networkidle");
      await page.locator(`a[href="/changes/new"]`).last().click();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/\/changes\/new/);
    });

    test("'Naar changes' link on 404 page navigates to changes overview", async ({ page }) => {
      await page.goto("/nonexistent-route");
      await page.waitForLoadState("networkidle");
      await page.locator(`a[href="/changes"]`).last().click();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/\/changes$/);
    });
  });
});
