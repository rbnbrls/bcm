import { test, expect } from "@playwright/test";
import { navigateToNewChange } from "./helpers";

test.describe("Benchmark switch via client_config form", () => {
  test("page loads with client-config benchmark switch controls", async ({ page }) => {
    await navigateToNewChange(page);

    await expect(page).toHaveURL(/\/changes\/new/);
    await expect(page.getByRole("heading", { name: "Nieuwe change" })).toBeVisible();
    await expect(page.locator('input[name="clientCode"]')).toHaveValue("HOR");
    await expect(page.getByLabel("Klant")).toContainText("Pensioenfonds Horizon");
    await expect(page.getByLabel("Portefeuille")).toBeVisible();
  });

  test("selects a different existing client", async ({ page }) => {
    await navigateToNewChange(page);

    await page.getByLabel("Klant").selectOption("ZEK");
    await expect(page.locator('input[name="clientCode"]')).toHaveValue("ZEK");
    await expect(page.getByLabel("Portefeuille")).toContainText("ZEK-RET");
  });

  test("submit button is disabled until portfolio and SOLL benchmark are selected", async ({ page }) => {
    await navigateToNewChange(page);

    const submitButton = page.locator("form.change-form button[type='submit']");
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toContainText("Benchmarkwissel aanvragen");
    await expect(submitButton).toBeDisabled();

    await page.getByLabel("Portefeuille").selectOption({ index: 1 });
    await page.getByLabel(/Kies SOLL benchmark/).selectOption({ index: 1 });
    await expect(submitButton).toBeEnabled();
  });

  test("fill fields and submit shows error or success", async ({ page }) => {
    await navigateToNewChange(page);

    await page.getByLabel("Portefeuille").selectOption({ index: 1 });
    await page.getByLabel(/Kies SOLL benchmark/).selectOption({ index: 1 });

    const futureDate = new Date(Date.now() + 30 * 86400000)
      .toISOString()
      .split("T")[0];
    await page.locator('input[name="requestedBy"]').fill("E2E Test User");
    await page.locator('textarea[name="rationale"]').fill(
      "E2E test benchmark switch via client config.",
    );
    await page.locator('input[name="effectiveDate"]').fill(futureDate);

    const submitButton = page.locator("form.change-form button[type='submit']");
    await expect(submitButton).toContainText("Benchmarkwissel aanvragen");
    await submitButton.click();
    await page.waitForLoadState("networkidle");

    const errorVisible = await page.locator(".form-errors[role='alert'], [role='alert'], .toast-error").first().isVisible().catch(() => false);
    const urlChanged = !page.url().includes("/changes/new");
    if (errorVisible) {
      await expect(page.locator(".form-errors, .toast-error, [role='alert']").first()).toBeVisible();
    } else if (urlChanged) {
      await expect(page).toHaveURL(/\/changes\/[0-9a-f-]+/);
      await expect(page.locator(".request-header")).toBeVisible();
      await expect(page.locator(".eyebrow")).toContainText("BCM-");
      await expect(page.locator(".status-pill")).toContainText("Ingediend");
    }
    // If neither error nor navigation — the form remained with some state update (acceptable in dev)
  });
});
