import { test, expect } from "@playwright/test";
import { navigateToCatalog } from "./helpers";

test.describe("Benchmark catalog browsing", () => {
  test("shows all benchmarks in catalog table", async ({ page }) => {
    await navigateToCatalog(page);

    // Verify the page heading
    await expect(page.getByRole("heading", { name: "Benchmark catalogus" })).toBeVisible();

    // Verify table header columns are present
    const headers = page.locator("table.config-table thead th");
    await expect(headers).toContainText(["Short name", "Long name", "Identifier", "Asset class", "Kosten (€)", "Leverancier"]);

    // Verify specific demo benchmarks are listed
    await expect(page.getByText("MSCI-WORLD-NR")).toBeVisible();
    await expect(page.getByText("MSCI-ACWI-NR")).toBeVisible();
    await expect(page.getByText("Bloomberg Euro Aggregate")).toBeVisible();

    // Verify the count shows total benchmarks
    await expect(page.locator(".config-table-count")).toContainText("12 van 12 benchmarks");
  });

  test("displays cost summary cards", async ({ page }) => {
    await navigateToCatalog(page);

    // Verify three cost cards exist
    const cards = page.locator(".cost-card");
    await expect(cards).toHaveCount(3);

    // Verify each card type label
    await expect(cards.nth(0)).toContainText("Benchmarkwissel");
    await expect(cards.nth(1)).toContainText("Benchmarkwissel + nieuw");
    await expect(cards.nth(2)).toContainText("Nieuwe benchmark");

    // Verify cost card shows doorlooptijd and kosten
    await expect(cards.nth(0)).toContainText("1 week");
    await expect(cards.nth(0)).toContainText("Kosten");

    // Verify "Nieuwe benchmark" card shows € 5.000
    await expect(cards.nth(2)).toContainText("€ 5.000");
  });

  test("shows benchmarks with different asset class values in the table", async ({ page }) => {
    await navigateToCatalog(page);

    // The table does not visually group by asset class, but we can verify multiple
    // asset class values appear in the table
    const tableBody = page.locator("table.config-table tbody");
    await expect(tableBody).toContainText("Aandelen");
    await expect(tableBody).toContainText("Obligaties");
    await expect(tableBody).toContainText("Alternatieven");
    await expect(tableBody).toContainText("Vastgoed");
  });

  test("navigates to catalog from homepage", async ({ page }) => {
    await navigateToCatalog(page);

    // Verify URL contains /benchmarks
    await expect(page).toHaveURL(/\/benchmarks/);

    // Verify the page heading
    await expect(page.getByRole("heading", { name: "Benchmark catalogus" })).toBeVisible();
  });
});
