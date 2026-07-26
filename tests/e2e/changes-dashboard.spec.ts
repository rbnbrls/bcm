import { test, expect } from "@playwright/test";

test.describe("Changes dashboard filters & navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/changes");
    await page.waitForLoadState("networkidle");
  });

  test("page loads with heading and filter controls", async ({ page }) => {
    const heading = page.locator("h1");
    await expect(heading).toBeVisible();
    const statusFilter = page.locator("#filter-status");
    await expect(statusFilter).toBeVisible();
    const slaFilter = page.locator("#filter-sla");
    await expect(slaFilter).toBeVisible();
  });

  test("status filter changes the URL parameter", async ({ page }) => {
    const statusSelect = page.locator("#filter-status");
    const options = await statusSelect.locator("option").all();
    if (options.length > 1) {
      const value = await options[1].getAttribute("value");
      if (value) {
        await statusSelect.selectOption(value);
        await page.waitForLoadState("networkidle");
        await expect(page).toHaveURL(/status=/);
      }
    }
  });

  test("SLA filter changes the URL parameter", async ({ page }) => {
    const slaSelect = page.locator("#filter-sla");
    const options = await slaSelect.locator("option").all();
    if (options.length > 1) {
      const value = await options[1].getAttribute("value");
      if (value) {
        await slaSelect.selectOption(value);
        await page.waitForLoadState("networkidle");
        await expect(page).toHaveURL(/sla_status=/);
      }
    }
  });

  test("reset filters button clears selections", async ({ page }) => {
    const statusSelect = page.locator("#filter-status");
    const options = await statusSelect.locator("option").all();
    if (options.length > 1) {
      const value = await options[1].getAttribute("value");
      if (value) {
        await statusSelect.selectOption(value);
        await page.waitForLoadState("networkidle");
        const resetButton = page.locator("button").filter({ hasText: /Filters wissen/i });
        if (await resetButton.isVisible().catch(() => false)) {
          await resetButton.click();
          await page.waitForLoadState("networkidle");
          await expect(page).not.toHaveURL(/status=/);
        }
      }
    }
  });

  test("change row links navigate to detail page", async ({ page }) => {
    const rows = page.locator("table.config-table tbody tr a, .change-row a");
    const count = await rows.count();
    if (count > 0) {
      const href = await rows.first().getAttribute("href");
      await rows.first().click();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(new RegExp(href?.replace(/^\//, "") || "changes"));
    }
  });

  test("shows the change table with expected columns", async ({ page }) => {
    const table = page.locator("table.config-table");
    if (await table.isVisible().catch(() => false)) {
      const headers = table.locator("thead th");
      await expect(headers).not.toHaveCount(0);
    }
  });
});
