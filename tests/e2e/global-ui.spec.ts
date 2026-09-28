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
      // Non-admin (change_manager) sees Dashboard, Mijn Werk, Runtime and
      // Workflow Studio — the runtime items are feature-flag gated and the
      // e2e jobs run with workflow_runtime.start enabled (matching the other
      // Workflow Studio flags). Beheer stays hidden without admin:access, and
      // the retired Wijzigingen/Rapportages entries are gone entirely.
      await expect(nav).toHaveCount(4);
      await expect(nav.nth(0)).toHaveText("Dashboard");
      await expect(nav.nth(1)).toHaveText("Mijn Werk");
      await expect(nav.nth(2)).toHaveText("Runtime");
      await expect(nav.nth(3)).toHaveText("Workflow Studio");
      await expect(page.locator("nav[aria-label='Hoofdnavigatie'] a[href='/changes']")).toHaveCount(0);
      await expect(page.locator("nav[aria-label='Hoofdnavigatie'] a[href='/reports']")).toHaveCount(0);
      await expect(page.locator("nav[aria-label='Hoofdnavigatie'] a[href='/admin']")).toHaveCount(0);
    });

    test("active nav item has aria-current attribute", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      // Dashboard should be active on /
      const dashboardLink = page.locator("nav[aria-label='Hoofdnavigatie'] a[href='/']");
      await expect(dashboardLink).toHaveAttribute("aria-current", "page");
    });

    test("Workflow Studio is active on its page", async ({ page }) => {
      await page.goto("/workflow-studio");
      await page.waitForLoadState("networkidle");
      const studioLink = page.locator("nav[aria-label='Hoofdnavigatie'] a[href='/workflow-studio']");
      await expect(studioLink).toHaveAttribute("aria-current", "page");
    });
  });

  test.describe("404 page", () => {
    test("shows not found page with navigation buttons", async ({ page }) => {
      await page.goto("/this-page-does-not-exist-12345");
      await page.waitForLoadState("networkidle");
      await expect(page.locator("h1")).toContainText(
        "We kunnen deze pagina niet vinden",
      );
      await expect(page.locator(`a[href="/change-catalog"]`).last()).toContainText("Nieuwe change");
      await expect(page.locator(`a[href="/"]`).last()).toContainText("Naar dashboard");
    });

    test("'Nieuwe change' link on 404 page navigates to the change catalog", async ({ page }) => {
      await page.goto("/this-page-does-not-exist-12345");
      await page.waitForLoadState("networkidle");
      await page.locator(`a[href="/change-catalog"]`).last().click();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/\/change-catalog/);
    });

    test("'Naar dashboard' link on 404 page navigates to the dashboard", async ({ page }) => {
      await page.goto("/nonexistent-route");
      await page.waitForLoadState("networkidle");
      await page.locator(`a[href="/"]`).last().click();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/\/$/);
    });
  });
});
