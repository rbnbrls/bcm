/**
 * Regression coverage for the removed legacy benchmark/asset-class request
 * functionality (PR #596).
 *
 * The four page routes were deleted; this spec proves they are no longer
 * exposed (HTTP 404 with the not-found page) and that the homepage contains no
 * link or label pointing at them anymore. Complements the data-layer checks in
 * tests/dashboard-categories.test.ts and tests/legacy-routes-removed.test.ts.
 */
import { test, expect } from "@playwright/test";

const LEGACY_URLS = [
  "/benchmarks",
  "/benchmark-aanvraag",
  "/asset-class-aanvraag",
  "/sub-asset-class-aanvraag",
] as const;

const LEGACY_LABELS = [
  "Benchmark catalogus",
  "Nieuwe benchmark aanvragen",
  "Nieuwe asset class aanvragen",
  "Nieuwe sub asset class aanvragen",
] as const;

test.describe("Removed legacy benchmark/asset-class routes", () => {
  for (const url of LEGACY_URLS) {
    test(`${url} is no longer exposed (404 with not-found page)`, async ({ page }) => {
      const response = await page.goto(url);
      expect(response?.status()).toBe(404);
      await expect(page.locator("h1")).toContainText("We kunnen deze pagina niet vinden");
    });
  }

  test("homepage has no link to any removed legacy route", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    for (const url of LEGACY_URLS) {
      await expect(page.locator(`a[href="${url}"]`)).toHaveCount(0);
    }
  });

  test("homepage shows none of the legacy benchmark/asset-class labels", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    for (const label of LEGACY_LABELS) {
      await expect(page.getByText(label, { exact: false })).toHaveCount(0);
    }
  });
});
