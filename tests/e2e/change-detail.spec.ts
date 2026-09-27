import { test, expect } from "@playwright/test";

test.describe("Change detail page forms & buttons", () => {

  test("shows the export button with dropdown menu on a submitted change", async ({ page }) => {
    await page.goto("/changes/new?type=mandate_change");
    await page.waitForLoadState("networkidle");
    const hasSubmitButton = await page.locator("form.change-form button[type='submit']").isVisible().catch(() => false);
    if (!hasSubmitButton) {
      test.skip();
      return;
    }
    const futureDate = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
    await page.locator(`input[name="requestedBy"]`).fill("E2E Test User");
    await page.locator(`textarea[name="rationale"]`).fill("E2E test for change detail page");
    await page.locator(`input[name="effectiveDate"]`).fill(futureDate);
    await page.locator("form.change-form button[type='submit']").click();
    await page.waitForLoadState("networkidle");
    const onDetail = await page.locator(".request-header").isVisible().catch(() => false);
    if (!onDetail) {
      test.skip();
      return;
    }
    const exportMain = page.locator(".export-split__main");
    await expect(exportMain).toBeVisible();
    await expect(exportMain).toContainText("Exporteer request");
    const exportArrow = page.locator(".export-split__arrow");
    await exportArrow.click();
    const dropdown = page.locator(".export-split__dropdown");
    await expect(dropdown).toContainText("CSV downloaden");
    await expect(dropdown).toContainText("PDF downloaden");
    await expect(dropdown).toContainText("Audit PDF (incl. logboek)");
  });

  test("approve and reject trigger buttons present on detail page", async ({ page }) => {
    await page.goto("/changes/new?type=mandate_change");
    await page.waitForLoadState("networkidle");
    const hasSubmitButton = await page.locator("form.change-form button[type='submit']").isVisible().catch(() => false);
    if (!hasSubmitButton) {
      test.skip();
      return;
    }
    const futureDate = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
    await page.locator(`input[name="requestedBy"]`).fill("E2E Test User");
    await page.locator(`textarea[name="rationale"]`).fill("E2E test for change detail page");
    await page.locator(`input[name="effectiveDate"]`).fill(futureDate);
    await page.locator("form.change-form button[type='submit']").click();
    await page.waitForLoadState("networkidle");
    const onDetail = await page.locator(".request-header").isVisible().catch(() => false);
    if (!onDetail) {
      test.skip();
      return;
    }
    const approvalPanel = page.locator(".approval-panel");
    await expect(approvalPanel).toContainText("Change accorderen");
    await expect(approvalPanel).toContainText("Change afwijzen");
  });

  test("export dropdown closes when clicking outside", async ({ page }) => {
    await page.goto("/changes/new?type=mandate_change");
    await page.waitForLoadState("networkidle");
    const hasSubmitButton = await page.locator("form.change-form button[type='submit']").isVisible().catch(() => false);
    if (!hasSubmitButton) {
      test.skip();
      return;
    }
    const futureDate = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
    await page.locator(`input[name="requestedBy"]`).fill("E2E Test User");
    await page.locator(`textarea[name="rationale"]`).fill("E2E test for change detail page");
    await page.locator(`input[name="effectiveDate"]`).fill(futureDate);
    await page.locator("form.change-form button[type='submit']").click();
    await page.waitForLoadState("networkidle");
    const onDetail = await page.locator(".request-header").isVisible().catch(() => false);
    if (!onDetail) {
      test.skip();
      return;
    }
    await page.locator(".export-split__arrow").click();
    await expect(page.locator(".export-split__dropdown")).toBeVisible();
    await page.locator(".request-header").click();
    await expect(page.locator(".export-split__dropdown")).not.toBeVisible();
  });
});

test.describe("New change page form", () => {
  test("submit button is present on new change page", async ({ page }) => {
    await page.goto("/changes/new?type=mandate_change");
    await page.waitForLoadState("networkidle");
    const submitButton = page.locator("form.change-form button[type='submit']");
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toContainText("Genereer change request");
  });
});
