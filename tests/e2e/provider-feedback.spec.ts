import { test, expect } from "@playwright/test";

test.describe("Provider feedback forms", () => {
  test.describe("Provider processing page", () => {
    test("processing page loads with heading", async ({ page }) => {
      await page.goto("/verwerkt");
      await page.waitForLoadState("networkidle");
      const heading = page.locator("h1");
      await expect(heading).toBeVisible();
    });
  });

  test.describe("Change detail page admin section", () => {
    test("new change page shows the change request form actions", async ({ page }) => {
      await page.goto("/changes/new");
      await page.waitForLoadState("networkidle");
      const submitButton = page.locator("form.change-form button[type='submit']");
      await expect(submitButton).toBeVisible();
      await expect(submitButton).toContainText("Genereer change request");
    });
  });
});
