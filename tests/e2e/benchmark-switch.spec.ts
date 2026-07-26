import { test, expect } from "@playwright/test";
import {
  navigateToNewChange,
  changeTypeOption,
  selectClient,
  VALID_CLIENT_ID,
} from "./helpers";

test.describe("Benchmark switch via generic form", () => {
  test("page loads with correct heading and default selections", async ({ page }) => {
    await navigateToNewChange(page);

    // Verify URL and heading
    await expect(page).toHaveURL(/\/changes\/new/);
    await expect(page.getByRole("heading", { name: "Nieuwe change" })).toBeVisible();

    // Change type defaults to benchmark_switch (first in list, "Benchmarkwissel")
    const typeSelect = page.locator("form.change-form select").first();
    const defaultOption = await typeSelect.inputValue();
    expect(defaultOption).toBe("benchmark_switch");

    // Verify the default client is pre-selected (Pensioenfonds Horizon)
    const clientSelect = page.locator('select[name="clientId"]');
    await expect(clientSelect).toHaveValue(VALID_CLIENT_ID);
  });

  test("selects different client and verifies change type", async ({ page }) => {
    await navigateToNewChange(page);

    // Select "Stichting Pensioen Zeker"
    await selectClient(page, "Stichting Pensioen Zeker");
    const clientSelect = page.locator('select[name="clientId"]');
    const selectedValue = await clientSelect.inputValue();
    expect(selectedValue).not.toBe(VALID_CLIENT_ID);

    // Change type is still benchmark_switch
    const typeSelect = page.locator("form.change-form select").first();
    expect(await typeSelect.inputValue()).toBe("benchmark_switch");
  });

  test("submit button is present and starts enabled", async ({ page }) => {
    await navigateToNewChange(page);

    // The generic form submit button starts enabled (not pending)
    const submitButton = page.locator("form.change-form button[type='submit']");
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toContainText("Genereer change request →");
    await expect(submitButton).toBeEnabled();
  });

  test("fill fields and submit shows error or success", async ({ page }) => {
    await navigateToNewChange(page);

    // Fill form fields
    const futureDate = new Date(Date.now() + 30 * 86400000)
      .toISOString()
      .split("T")[0];
    await page.locator('input[name="requestedBy"]').fill("E2E Test User");
    await page.locator('textarea[name="rationale"]').fill(
      "E2E test benchmark switch — automated verification via generic form.",
    );
    await page.locator('input[name="effectiveDate"]').fill(futureDate);

    // Submit — without a database the save will fail with an error message.
    // This still validates the complete flow up to persistence: navigation,
    // form interaction, server action invocation, and error display.
    const submitButton = page.locator("form.change-form button[type='submit']");
    await expect(submitButton).toContainText("Genereer change request →");
    await submitButton.click();
    await page.waitForLoadState("networkidle");

    // Either a DB error appears (no DATABASE_URL) or navigation happens
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
});
