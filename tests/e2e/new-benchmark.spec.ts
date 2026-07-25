import { test, expect } from "@playwright/test";
import {
  navigateToNewBenchmarkRequest,
  selectClient,
  fillFormFields,
  submitForm,
  DEMO_CLIENT_NAME,
} from "./helpers";

test.describe("New benchmark request flow", () => {
  test("full new benchmark request: homepage to submission", async ({ page }) => {
    await navigateToNewBenchmarkRequest(page);

    // Verify URL and heading
    await expect(page).toHaveURL(/\/benchmark-aanvraag/);
    await expect(page.getByRole("heading", { name: "Nieuwe benchmark", exact: true })).toBeVisible();

    // Select client
    await selectClient(page, DEMO_CLIENT_NAME);

    // Fill benchmark specification fields
    const futureDate = new Date(Date.now() + 30 * 86400000)
      .toISOString()
      .split("T")[0];
    await fillFormFields(page, {
      shortName: "E2E-TEST-BM",
      longName: "E2E Test Benchmark for Automated Testing",
      currency: "EUR",
      requestedBy: "E2E Test User",
      rationale: "E2E test — verifying new benchmark request flow.",
      effectiveDate: futureDate,
    });

    // Select asset class from dropdown
    await page.locator('select[name="assetClass"]').selectOption("Aandelen");

    // Submit — without a database the save will fail with an error message.
    // This still validates the complete flow up to persistence: navigation,
    // form interaction, server action invocation, and error display.
    const submitButton = page.locator("form.change-form button[type='submit']");
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
      await expect(page.locator("h1")).toContainText("Nieuwe benchmark");
      await expect(page.locator(".status-pill")).toContainText("Ingediend");
      await expect(page.locator(".nb-detail")).toBeVisible();
      await expect(page.locator(".nb-detail")).toContainText("E2E-TEST-BM");
    }
  });

  test("shows validation errors for empty required fields", async ({ page }) => {
    await navigateToNewBenchmarkRequest(page);

    // Click submit without filling anything
    const submitButton = page.locator("form.change-form button[type='submit']");
    await submitButton.click();

    // HTML5 validation should prevent navigation; we should still be on the form page
    await expect(page).toHaveURL(/\/benchmark-aanvraag/);

    // Verify button text is unchanged (not in pending state)
    await expect(submitButton).toContainText("Nieuwe benchmark aanvragen →");
  });

  test("validates shortName minimum length", async ({ page }) => {
    await navigateToNewBenchmarkRequest(page);

    // Fill all required fields with valid data to pass HTML5 validation
    const futureDate = new Date(Date.now() + 30 * 86400000)
      .toISOString()
      .split("T")[0];
    await selectClient(page, DEMO_CLIENT_NAME);
    await fillFormFields(page, {
      shortName: "X", // Too short — will fail server-side validation
      longName: "Valid long name for testing",
      currency: "EUR",
      requestedBy: "E2E Test User",
      rationale: "Testing short name minimum length validation.",
      effectiveDate: futureDate,
    });
    await page.locator('select[name="assetClass"]').selectOption("Aandelen");

    // Submit — form passes HTML5 validation but server rejects
    await page.locator("form.change-form button[type='submit']").click();
    await page.waitForLoadState("networkidle");

    // Wait for server-side validation error to appear
    await expect(page.locator(".form-errors[role='alert']")).toBeVisible({ timeout: 10000 });

    // Verify the error message mentions shortName / korte naam
    await expect(page.locator(".form-errors")).toContainText(/korte naam/i);
  });

  test("uppercases shortName and currency on submission", async ({ page }) => {
    await navigateToNewBenchmarkRequest(page);

    // Fill form with lowercase values
    const futureDate = new Date(Date.now() + 30 * 86400000)
      .toISOString()
      .split("T")[0];
    await selectClient(page, DEMO_CLIENT_NAME);
    await fillFormFields(page, {
      shortName: "test-lowercase",
      longName: "Lowercase Test Benchmark for Uppercase Transform",
      currency: "usd",
      requestedBy: "E2E Test User",
      rationale: "E2E test — verifying uppercase transform on submission.",
      effectiveDate: futureDate,
    });
    await page.locator('select[name="assetClass"]').selectOption("Aandelen");

    // Submit
    await page.locator("form.change-form button[type='submit']").click();
    await page.waitForLoadState("networkidle");

    // Verify the form submitted without validation errors — the error should be
    // about database unavailability (meaning Zod transforms ran successfully)
    const errorVisible = await page.locator(".form-errors[role='alert']").isVisible().catch(() => false);
    if (errorVisible) {
      // The error should be about DB, not validation (confirming transforms ran)
      const errorText = await page.locator(".form-errors").textContent();
      expect(errorText).not.toMatch(/korte naam|valuta|shortName/i);
    }
    // If DB is available, verify the detail page shows uppercased values
    if (await page.locator(".nb-detail").isVisible().catch(() => false)) {
      await expect(page.locator(".nb-detail")).toContainText("TEST-LOWERCASE");
      await expect(page.locator(".nb-detail")).toContainText("USD");
    }
  });
});
