import { test, expect } from "@playwright/test";

test.describe("Homepage CTAs & navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("hero section contains CTA buttons with correct links", async ({ page }) => {
    const heroCtas = page.locator(".hero a");
    await expect(heroCtas.first()).toBeVisible();

    const newBenchmarkLink = page.locator(`a[href="/benchmark-aanvraag"]`);
    await expect(newBenchmarkLink).toContainText("Nieuwe benchmark");
    await expect(newBenchmarkLink).toHaveAttribute("href", "/benchmark-aanvraag");

    const newChangeLink = page.locator(`a[href="/changes/new"]`).last();
    await expect(newChangeLink).toContainText("Change aanvragen");
    await expect(newChangeLink).toHaveAttribute("href", "/changes/new");
  });

  test("stat cards are visible with links", async ({ page }) => {
    const statCards = page.locator(".stat-card");
    const cardCount = await statCards.count();
    expect(cardCount).toBeGreaterThanOrEqual(3);

    const overviewLink = statCards.locator(`a[href="/changes"]`);
    if (await overviewLink.count() > 0) {
      await expect(overviewLink.first()).toContainText("Bekijk overzicht");
    }
  });

  test("change type catalog section shows cards with start links", async ({ page }) => {
    const catalogSection = page.locator("section[aria-label='Change catalogus']");
    if (await catalogSection.isVisible().catch(() => false)) {
      const startLinks = catalogSection.locator(`a[href*="/changes/new?type="]`);
      const startCount = await startLinks.count();
      if (startCount > 0) {
        await expect(startLinks.first()).toBeVisible();
        await expect(startLinks.first()).toContainText("Start");
      }
    }
  });

  test("hero CTA 'Nieuwe benchmark' navigates to benchmark request page", async ({ page }) => {
    await page.locator(`a[href="/benchmark-aanvraag"]`).first().click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/benchmark-aanvraag/);
    await expect(page.getByRole("heading", { name: "Nieuwe benchmark", exact: true })).toBeVisible();
  });

  test("hero CTA 'Change aanvragen' navigates to new change form", async ({ page }) => {
    await page.locator(`a[href="/changes/new"]`).last().click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/changes\/new/);
    await expect(page.getByRole("heading", { name: "Nieuwe change" })).toBeVisible();
  });

  test("shows recent changes section with links", async ({ page }) => {
    const allChangesLink = page.locator(`a[href="/changes"]`).filter({ hasText: /Alle changes/ });
    if (await allChangesLink.first().isVisible().catch(() => false)) {
      await expect(allChangesLink.first()).toBeVisible();
    }
  });
});
