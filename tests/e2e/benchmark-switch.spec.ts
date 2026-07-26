import { test, expect } from "@playwright/test";
import {
  navigateToBenchmarkSwitch,
  selectClient,
  fillFormFields,
  submitForm,
  DEMO_CLIENT_NAME,
} from "./helpers";

test.describe("Change request flow (generic form)", () => {
  test("page loads with change type selector and client selector", async ({ page }) => {
    await navigateToBenchmarkSwitch(page);

    // Verify URL and heading
    await expect(page).toHaveURL(/\/changes\/new/);
    await expect(page.getByRole("heading", { name: "Nieuwe change" })).toBeVisible();

    // Verify the change type dropdown is present with Benchmarkwissel pre-selected
    const changeTypeSelect = page.locator("section.form-section").first().locator("select").first();
    await expect(changeTypeSelect).toBeVisible();
    await expect(changeTypeSelect).toContainText("Benchmarkwissel");

    // Verify client selector is visible
    const clientSelect = page.locator('select[name="clientId"]');
    await expect(clientSelect).toBeVisible();
    await expect(clientSelect).toContainText(DEMO_CLIENT_NAME);

    // Verify form sections are present
    await expect(page.locator("text=Context van de aanvraag")).toBeVisible();
    await expect(page.locator("text=Controle en verzending")).toBeVisible();
  });

  test("selects a different client and verifies form updates", async ({ page }) => {
    await navigateToBenchmarkSwitch(page);

    // Select "Stichting Pensioen Zeker"
    await selectClient(page, "Stichting Pensioen Zeker");

    // Verify the client select changed
    const clientSelect = page.locator('select[name="clientId"]');
    await expect(clientSelect).toContainText("Stichting Pensioen Zeker");
  });

  test("switching change type renders different dynamic fields", async ({ page }) => {
    await navigateToBenchmarkSwitch(page);

    // Select "Tariefwijziging" from the change type dropdown
    const changeTypeSection = page.locator("section.form-section").first();
    const changeTypeSelect = changeTypeSection.locator("select").first();
    await changeTypeSelect.selectOption("fee_change");

    // Verify the dynamic fields for Tariefwijziging appear
    // (current_fee, requested_fee, fee_type are rendered as fields)
    await expect(page.locator('input[name="current_fee"]')).toBeVisible();
    await expect(page.locator('input[name="requested_fee"]')).toBeVisible();
    await expect(page.locator('select[name="fee_type"]')).toBeVisible();

    // Verify the submit row shows "Tariefwijziging"
    await expect(page.locator(".submit-row")).toContainText("Tariefwijziging");
  });

  test("submit button is enabled initially and shows correct text", async ({ page }) => {
    await navigateToBenchmarkSwitch(page);

    const submitButton = page.locator("form.change-form button[type='submit']");
    await expect(submitButton).toBeEnabled();
    await expect(submitButton).toContainText("Genereer change request →");
  });

  test("form submission shows validation errors when required fields are empty", async ({ page }) => {
    await navigateToBenchmarkSwitch(page);

    // Wait for the form to be fully hydrated
    await page.waitForSelector("form.change-form button[type='submit']");

    // Fill form fields but leave dynamic fields empty
    const futureDate = new Date(Date.now() + 30 * 86400000)
      .toISOString()
      .split("T")[0];
    await fillFormFields(page, {
      requestedBy: "E2E Test User",
      rationale: "E2E test benchmark switch — automated verification.",
      effectiveDate: futureDate,
    });

    // Submit the form
    const submitButton = page.locator("form.change-form button[type='submit']");
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    // Wait for a server action POST to complete by checking for form errors
    // or that the page stays on /changes/new
    await page.waitForURL(/\/changes\/new/, { timeout: 5000 });

    // Give React time to re-render with the server action response
    await page.waitForTimeout(2000);

    // Verify validation errors appear
    await expect(page.locator(".form-errors")).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".form-errors")).toContainText("verplicht");
  });
});
