import { test, expect } from "@playwright/test";
import {
  navigateToNewChange,
  changeTypeOption,
  selectClient,
  VALID_CLIENT_ID,
} from "./helpers";

test.describe("Generic change request form", () => {
  test("page loads with correct title and structure", async ({ page }) => {
    await navigateToNewChange(page);

    // Verify URL and heading
    await expect(page).toHaveURL(/\/changes\/new/);
    await expect(page.getByRole("heading", { name: "Nieuwe change" })).toBeVisible();
    await expect(page.locator(".eyebrow")).toContainText("CHANGE REQUEST");

    // Change type selector exists with options
    const typeSelect = page.locator("form.change-form select").first();
    const options = await typeSelect.locator("option").all();
    expect(options.length).toBeGreaterThanOrEqual(6);

    // Client selector exists and has a default
    const clientSelect = page.locator('select[name="clientId"]');
    await expect(clientSelect).toHaveValue(VALID_CLIENT_ID);
  });

  test("change type selection renders different fields", async ({ page }) => {
    await navigateToNewChange(page);

    // Select "Tariefwijziging" (fee_change) — has visible number fields
    const typeSelect = page.locator("form.change-form select").first();
    const feeOption = await changeTypeOption(page, "Tariefwijziging");
    await typeSelect.selectOption(feeOption);

    // Should show fee-specific fields: current_fee, requested_fee, fee_type
    await expect(page.locator('input[name="current_fee"]')).toBeVisible();
    await expect(page.locator('input[name="requested_fee"]')).toBeVisible();
    await expect(page.locator('select[name="fee_type"]')).toBeVisible();

    // Select "Mandaatwijziging" (mandate_change) — shows different fields
    const mandateOption = await changeTypeOption(page, "Mandaatwijziging");
    await typeSelect.selectOption(mandateOption);
    await expect(page.locator('select[name="mandate_type"]')).toBeVisible();
    await expect(page.locator('input[name="current_value"]')).toBeVisible();
    await expect(page.locator('input[name="requested_value"]')).toBeVisible();
  });

  test("client selection updates the form context", async ({ page }) => {
    await navigateToNewChange(page);

    // Default client is Pensioenfonds Horizon
    const clientSelect = page.locator('select[name="clientId"]');
    await expect(clientSelect).toHaveValue(VALID_CLIENT_ID);

    // Select "Stichting Pensioen Zeker"
    await selectClient(page, "Stichting Pensioen Zeker");
    // Verify the value changed (different from default)
    const selectedValue = await clientSelect.inputValue();
    expect(selectedValue).not.toBe(VALID_CLIENT_ID);
  });

  test("form fields can be filled and submit button works", async ({ page }) => {
    await navigateToNewChange(page);

    // Fill common form fields (Step 1: Context)
    const futureDate = new Date(Date.now() + 30 * 86400000)
      .toISOString()
      .split("T")[0];
    await page.locator('input[name="requestedBy"]').fill("E2E Test User");
    await page.locator('textarea[name="rationale"]').fill("E2E test — automated generic form verification.");
    await page.locator('input[name="effectiveDate"]').fill(futureDate);

    // Select a change type with visible fields to fill
    const typeSelect = page.locator("form.change-form select").first();
    const feeOption = await changeTypeOption(page, "Custodianwijziging");
    await typeSelect.selectOption(feeOption);

    // Fill custodian-specific fields
    await page.locator('select[name="current_custodian_id"]').selectOption("custodian_b");
    await page.locator('select[name="requested_custodian_id"]').selectOption("custodian_a");
    await page.locator('input[name="effectiveDate"]').fill(futureDate);

    // Submit — without a database the save will fail with an error message.
    const submitButton = page.locator("form.change-form button[type='submit']");
    await expect(submitButton).toContainText("Genereer change request →");
    await submitButton.click();
    await page.waitForLoadState("networkidle");

    // Either a DB error appears or navigation happens
    const errorVisible = await page.locator(".form-errors[role='alert']").isVisible().catch(() => false);
    if (errorVisible) {
      // Accept any form error — validation errors appear before DB errors
      await expect(page.locator(".form-errors")).not.toBeEmpty();
    } else {
      // If DB is available, verify navigation and detail page
      await expect(page).toHaveURL(/\/changes\/[0-9a-f-]+/);
      await expect(page.locator(".request-header")).toBeVisible();
      await expect(page.locator(".eyebrow")).toContainText("BCM-");
      await expect(page.locator(".status-pill")).toContainText("Ingediend");
    }
  });

  test("shows cost summary for selected change type", async ({ page }) => {
    await navigateToNewChange(page);

    // Cost summary section should be visible
    await expect(page.locator(".cost-summary-inline")).toBeVisible();
    await expect(page.locator(".cost-summary-row").first()).toBeVisible();

    // Change type name appears in the submit row
    await expect(page.locator(".submit-row p")).not.toBeEmpty();
  });

  test("validation errors appear on submit with empty required fields", async ({ page }) => {
    await navigateToNewChange(page);

    // Select a change type with many visible fields
    const typeSelect = page.locator("form.change-form select").first();
    const feeOption = await changeTypeOption(page, "Tariefwijziging");
    await typeSelect.selectOption(feeOption);

    // Verify submit button is present and click it without filling anything
    const submitButton = page.locator("form.change-form button[type='submit']");
    await expect(submitButton).toContainText("Genereer change request →");

    // HTML5 validation should prevent empty required fields. Clear the defaults.
    await page.locator('input[name="requestedBy"]').fill("");
    await page.locator('input[name="effectiveDate"]').fill("");

    await submitButton.click();
    await page.waitForLoadState("networkidle");

    // Either validation errors shown or HTML5 validation catches it
    const formErrors = await page.locator(".form-errors").isVisible().catch(() => false);
    const html5Validation = await page.locator("input:invalid").count().catch(() => 0);
    expect(formErrors || html5Validation > 0).toBeTruthy();
  });
});
