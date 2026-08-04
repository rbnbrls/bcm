import { test, expect } from "@playwright/test";
import { setAdminRole } from "./helpers";

test.describe("Admin pages forms", () => {
  test.describe("Webhooks admin", () => {
    test.beforeEach(async ({ page }) => {
      await setAdminRole(page);
      await page.goto("/admin/webhooks");
      await page.waitForLoadState("networkidle");
    });

    test("page loads with heading and webhook form", async ({ page }) => {
      await expect(page.getByRole("heading", { name: "Webhooks", exact: true })).toBeVisible();
      await expect(page.locator(".webhook-form")).toBeVisible();
      await expect(page.locator(`input[name="name"]`)).toBeVisible();
      await expect(page.locator(`input[name="url"]`)).toBeVisible();
    });

    test("webhook form has required fields and submit button", async ({ page }) => {
      await expect(page.locator(`input[name="name"]`)).toHaveAttribute("required", "");
      await expect(page.locator(`input[name="url"]`)).toHaveAttribute("required", "");
      await expect(page.locator(`input[name="url"]`)).toHaveAttribute("type", "url");
      const submitButton = page.locator(".webhook-form button[type='submit']");
      await expect(submitButton).toContainText("Webhook toevoegen");
    });

    test("shows webhook list section", async ({ page }) => {
      const webhookList = page.locator(".webhook-list, .webhook-cards, .webhook-card");
      await expect(webhookList.first()).toBeVisible();
    });
  });
});
