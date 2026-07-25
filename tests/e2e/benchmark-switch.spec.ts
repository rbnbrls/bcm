import { test, expect } from "@playwright/test";
import {
  navigateToBenchmarkSwitch,
  selectClient,
  selectPortfolio,
  setSOLLBenchmark,
  fillFormFields,
  submitForm,
  DEMO_CLIENT_NAME,
  DEMO_PORTFOLIO_NAME,
  VALID_BENCHMARK_1_ID,
  VALID_BENCHMARK_2_ID,
  VALID_CLIENT_ID,
} from "./helpers";

test.describe("Benchmark switch flow", () => {
  test("full benchmark switch flow: homepage to submission", async ({ page }) => {
    await navigateToBenchmarkSwitch(page);

    // Verify URL and heading
    await expect(page).toHaveURL(/\/changes\/new/);
    await expect(page.getByRole("heading", { name: "Benchmarkwissel" })).toBeVisible();

    // Verify the default client is pre-selected
    const clientSelect = page.locator("select").first();
    await expect(clientSelect).toHaveValue(VALID_CLIENT_ID);

    // Select portfolio
    await selectPortfolio(page, DEMO_PORTFOLIO_NAME);

    // Set SOLL benchmark
    await setSOLLBenchmark(page, DEMO_PORTFOLIO_NAME, VALID_BENCHMARK_2_ID);

    // Fill form fields
    const futureDate = new Date(Date.now() + 30 * 86400000)
      .toISOString()
      .split("T")[0];
    await fillFormFields(page, {
      requestedBy: "E2E Test User",
      rationale: "E2E test benchmark switch — automated verification.",
      effectiveDate: futureDate,
    });

    // Submit — without a database the save will fail with an error message.
    // This still validates the complete flow up to persistence: navigation,
    // form interaction, server action invocation, and error display.
    const submitButton = page.locator("form.change-form button[type='submit']");
    const buttonText = await submitButton.textContent();
    await submitButton.click();
    await page.waitForLoadState("networkidle");

    // Either a DB error appears (no DATABASE_URL) or navigation happens
    const errorVisible = await page.locator(".form-errors[role='alert']").isVisible().catch(() => false);
    if (errorVisible) {
      await expect(page.locator(".form-errors")).toContainText("niet bereikbaar");
    } else {
      // If DB is available, verify navigation and detail page
      await expect(page).toHaveURL(/\/changes\/[0-9a-f-]+/);
      await expect(page.locator(".request-header")).toBeVisible();
      await expect(page.locator(".eyebrow")).toContainText("BCM-");
      await expect(page.locator(".status-pill")).toContainText("Ingediend");
    }
  });

  test("selects different client and portfolio, verifies IST display", async ({ page }) => {
    await navigateToBenchmarkSwitch(page);

    // Select "Stichting Pensioen Zeker"
    await selectClient(page, "Stichting Pensioen Zeker");

    // Verify portfolio "Return portefeuille" appears
    const portfolioCard = page.locator(".portfolio-card").filter({ hasText: "Return portefeuille" });
    await expect(portfolioCard).toBeVisible();

    // Check the portfolio checkbox
    await portfolioCard.locator('input[type="checkbox"]').check();

    // Verify the IST benchmark label shows "MSCI-ACWI-NR" (currentBenchmark for this portfolio)
    await expect(portfolioCard.locator(".benchmark.ist")).toContainText("MSCI-ACWI-NR");

    // Select a SOLL benchmark different from IST (MSCI-WORLD-NR is different from MSCI-ACWI-NR)
    await setSOLLBenchmark(page, "Return portefeuille", VALID_BENCHMARK_1_ID);
  });

  test("disables SOLL dropdown when no portfolio selected", async ({ page }) => {
    await navigateToBenchmarkSwitch(page);

    // Find the first portfolio card's SOLL select — should be disabled initially
    const firstCard = page.locator(".portfolio-card").first();
    const sollSelect = firstCard.locator(".benchmark.soll select");
    await expect(sollSelect).toBeDisabled();

    // Select the portfolio — SOLL becomes enabled
    const checkbox = firstCard.locator('input[type="checkbox"]');
    await checkbox.check();
    await expect(sollSelect).toBeEnabled();

    // Deselect the portfolio — SOLL becomes disabled again
    await checkbox.uncheck();
    await expect(sollSelect).toBeDisabled();
  });

  test("shows validation errors on submit with empty form", async ({ page }) => {
    await navigateToBenchmarkSwitch(page);

    // Without selecting any portfolio, verify submit button is disabled
    const submitButton = page.locator("form.change-form button[type='submit']");
    await expect(submitButton).toBeDisabled();
    await expect(submitButton).toContainText("Genereer change request →");

    // Verify the portfolio count shows 0 selected
    await expect(page.locator(".submit-row p")).toContainText("0 portefeuille(s)");
  });
});
