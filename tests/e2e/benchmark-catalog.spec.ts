import { test, expect } from "@playwright/test";
import { navigateToCatalog } from "./helpers";

test.describe("Benchmark catalog browsing", () => {
  test("shows all benchmarks in catalog table", async ({ page }) => {
    await navigateToCatalog(page);

    // Verify the page heading
    await expect(page.getByRole("heading", { name: "Benchmark catalogus" })).toBeVisible();

    // Verify table header columns are present (client-config reference table
    // columns per the f4a0dda catalog redesign: code, name, id, rimes code)
    const headers = page.locator("table.config-table thead th");
    await expect(headers).toContainText(["Benchmarkcode", "Naam", "ID", "Rimes code"]);

    // Verify specific demo benchmarks are listed
    await expect(page.getByText("MSCI-WORLD-NR")).toBeVisible();
    await expect(page.getByText("MSCI-ACWI-NR")).toBeVisible();
    await expect(page.getByText("Bloomberg Euro Aggregate")).toBeVisible();

    // Verify the count shows total benchmarks (5 client-config demo fixtures)
    await expect(page.locator(".config-table-count")).toContainText("5 van 5 benchmarks");
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
    await expect(cards.nth(1)).toContainText("€ 5.000");

    // Verify "Nieuwe benchmark" card shows € 5.000
    await expect(cards.nth(2)).toContainText("€ 5.000");
    await expect(cards.nth(2)).toContainText("4 weken");
  });

  test("shows benchmark codes, names, IDs and Rimes codes in the table", async ({ page }) => {
    await navigateToCatalog(page);

    // The table lists the client-config benchmarks with their code, name,
    // numeric id and Rimes code (replacing the old asset-class column)
    const tableBody = page.locator("table.config-table tbody");
    await expect(tableBody).toContainText("MSCI-WORLD-NR");
    await expect(tableBody).toContainText("MSCI ACWI Net Return");
    await expect(tableBody).toContainText("BLOOMBERG-EU-AGG");
    await expect(tableBody).toContainText("Duurzame NL Benchmark");

    // Rimes codes render in the last column
    await expect(tableBody).toContainText("MWNR");
    await expect(tableBody).toContainText("MACWI");
    await expect(tableBody).toContainText("BEUA");
    await expect(tableBody).toContainText("BGLA");
    await expect(tableBody).toContainText("CESG");
  });

  test("navigates to catalog from homepage", async ({ page }) => {
    await navigateToCatalog(page);

    // Verify URL contains /benchmarks
    await expect(page).toHaveURL(/\/benchmarks/);

    // Verify the page heading
    await expect(page.getByRole("heading", { name: "Benchmark catalogus" })).toBeVisible();
  });
});
