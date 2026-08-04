import { test, expect } from "@playwright/test";
import { fillWizardPortfolioCode } from "./helpers";

test.describe("Portfolio addition (Nieuwe portfolio toevoegen)", () => {
  test("loads the 4-step wizard when type=portfolio_addition is preselected", async ({ page }) => {
    await page.goto("/changes/new?type=portfolio_addition");
    await page.waitForURL("**/changes/new?type=portfolio_addition");

    // Should show the custom wizard, not the generic form
    await expect(page.locator(".step-indicator")).toBeVisible();
    await expect(page.locator(".step-dot")).toHaveCount(4);

    // Step 1 should be active with "Portfolio definiëren" heading
    await expect(page.getByRole("heading", { name: "Portfolio definiëren" })).toBeVisible();
    await expect(page.locator('[aria-label="Stap 1"]')).toBeVisible();
  });

  test("step 1: shows portfolio definition fields and validates", async ({ page }) => {
    await page.goto("/changes/new?type=portfolio_addition");
    await page.waitForURL("**/changes/new?type=portfolio_addition");

    // Step 1 fields should be visible — no client select (3NF design)
    await expect(page.locator('input[placeholder="Bijv. ADP"]')).toBeVisible();
    await expect(page.locator('input[placeholder="Bijv. Rendementsportefeuille aandelen"]')).toBeVisible();
    await expect(page.locator('input[placeholder="Bijv. RPA"]')).toBeVisible();
    await expect(page.locator("label").filter({ hasText: "Benchmark" })).toBeVisible();

    // "Volgende →" button should be disabled initially (no fields filled)
    const nextButton = page.locator("button:has-text('Volgende →')");
    await expect(nextButton).toBeDisabled();

    // Fill step 1 fields
    await fillWizardPortfolioCode(page, "ADP");
    await page.locator('input[placeholder="Bijv. Rendementsportefeuille aandelen"]').fill("E2E Test Portfolio");
    await page.locator('input[placeholder="Bijv. RPA"]').fill("E2E-TEST-NP");
    // Select first non-empty benchmark option
    const benchmarkSelect = page.locator("select").first();
    const benchmarkOptions = await benchmarkSelect.locator("option").all();
    // Skip the "Kies benchmark" default option
    if (benchmarkOptions.length > 1) {
      await benchmarkSelect.selectOption({ index: 1 });
    }

    // "Volgende →" should now be enabled
    await expect(nextButton).toBeEnabled();
  });

  test("full step-by-step flow from step 1 through step 4", async ({ page }) => {
    await page.goto("/changes/new?type=portfolio_addition");
    await page.waitForURL("**/changes/new?type=portfolio_addition");

    // ─── Step 1: Portfolio definiëren ───
    await expect(page.getByRole("heading", { name: "Portfolio definiëren" })).toBeVisible();

    // Fill step 1
    await fillWizardPortfolioCode(page, "ADP");
    await page.locator('input[placeholder="Bijv. Rendementsportefeuille aandelen"]').fill("E2E Test Portfolio");
    await page.locator('input[placeholder="Bijv. RPA"]').fill("E2E-TEST-NP");
    // Select benchmark by visible text
    await page.locator("select").first().selectOption("MSCI-WORLD-NR");

    // Go to step 2
    await page.locator("button:has-text('Volgende →')").click();

    // ─── Step 2: Dimensies instellen ───
    await expect(page.getByText("Dimensies instellen")).toBeVisible();
    await expect(page.locator('[aria-label="Stap 2"]')).toBeVisible();

    // "Volgende →" should be disabled initially (step 2 empty)
    const nextButton = page.locator("button:has-text('Volgende →')");
    await expect(nextButton).toBeDisabled();

    // Step 2 has 3 selects: asset class, sub asset class, manager
    // Step 1 DOM removed via conditional rendering; step 2 selects are nth(0-2)
    await page.locator("select").nth(0).selectOption("EQUITIES");

    // Sub asset class should now be enabled with filtered options
    await expect(page.locator("select").nth(1)).toBeEnabled();
    await page.locator("select").nth(1).selectOption("AC WORLD");

    // Select manager
    await page.locator("select").nth(2).selectOption("EIG");

    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    // ─── Step 3: NPC classificatie ───
    await expect(page.getByRole("heading", { name: "NPC classificatie" })).toBeVisible();
    await expect(page.locator('[aria-label="Stap 3"]')).toBeVisible();

    // Select NPC classification (step 3 has 1 select)
    await page.locator("select").nth(0).selectOption("2");

    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    // ─── Step 4: Controleren en verzenden ───
    await expect(page.getByText("Controleren en verzenden")).toBeVisible();
    await expect(page.locator('[aria-label="Stap 4"]')).toBeVisible();

    // Verify summary data is shown
    await expect(page.locator(".summary-box")).toBeVisible();
    await expect(page.getByText("E2E Test Portfolio")).toBeVisible();
    await expect(page.getByText("E2E-TEST-NP")).toBeVisible();
    await expect(page.getByText("EQUITIES")).toBeVisible();
    await expect(page.getByText("AC WORLD")).toBeVisible();

    // Fill request metadata — inputs don't have name attrs, use label-based locators
    const futureDate = new Date(Date.now() + 30 * 86400000)
      .toISOString()
      .split("T")[0];
    await page.locator("label").filter({ hasText: "Aangevraagd door" }).locator("input").fill("E2E Test User");
    await page.locator('input[type="date"]').fill(futureDate);
    await page.locator("label").filter({ hasText: "Reden" }).locator("textarea").fill("E2E test portfolio addition — automated verification.");
  });

  test("back navigation preserves field values between steps", async ({ page }) => {
    await page.goto("/changes/new?type=portfolio_addition");
    await page.waitForURL("**/changes/new?type=portfolio_addition");

    // Fill step 1
    await fillWizardPortfolioCode(page, "ADP");
    await page.locator('input[placeholder="Bijv. Rendementsportefeuille aandelen"]').fill("Back Nav Test");
    await page.locator('input[placeholder="Bijv. RPA"]').fill("BACK-TEST-01");
    await page.locator("select").first().selectOption("MSCI-WORLD-NR");
    await page.locator("button:has-text('Volgende →')").click();

    // Now on step 2 — go back
    await page.locator("button:has-text('← Terug')").click();

    // Should be back on step 1 with values preserved
    await expect(page.getByRole("heading", { name: "Portfolio definiëren" })).toBeVisible();
    await expect(page.locator('input[placeholder="Bijv. Rendementsportefeuille aandelen"]')).toHaveValue("Back Nav Test");
    await expect(page.locator('input[placeholder="Bijv. RPA"]')).toHaveValue("BACK-TEST-01");
    await expect(page.locator('input[placeholder="Bijv. ADP"]')).toHaveValue("ADP");
  });

  test("step navigation is blocked on incomplete required fields", async ({ page }) => {
    await page.goto("/changes/new?type=portfolio_addition");
    await page.waitForURL("**/changes/new?type=portfolio_addition");

    // Try to go next without filling anything on step 1
    const nextButton = page.locator("button:has-text('Volgende →')");
    await expect(nextButton).toBeDisabled();

    // Fill only name, leave portfolio code and benchmark empty
    await page.locator('input[placeholder="Bijv. Rendementsportefeuille aandelen"]').fill("Partial Only");
    await expect(nextButton).toBeDisabled(); // portfolio code and benchmark still empty
  });

  test("submit button shows on step 4 with correct label", async ({ page }) => {
    await page.goto("/changes/new?type=portfolio_addition");
    await page.waitForURL("**/changes/new?type=portfolio_addition");

    // Navigate through all steps with minimal valid data
    // Step 1: portfolio code, long name, short name, benchmark
    await fillWizardPortfolioCode(page, "SBT");
    await page.locator('input[placeholder="Bijv. Rendementsportefeuille aandelen"]').fill("Submit Test PF");
    await page.locator('input[placeholder="Bijv. RPA"]').fill("SUBMIT-TEST-01");
    await page.locator("select").first().selectOption("MSCI-WORLD-NR");
    await page.locator("button:has-text('Volgende →')").click();

    // Step 2: asset class, sub asset class, manager
    // Step 1 DOM removed; step 2 selects are nth(0-2)
    await page.locator("select").nth(0).selectOption("FIXED_INCOME");
    await page.locator("select").nth(1).selectOption("CORPORATES EUROPE");
    await page.locator("select").nth(2).selectOption("AQR");
    await page.locator("button:has-text('Volgende →')").click();

    // Step 3: NPC classification (1 select, nth(0))
    await page.locator("select").nth(0).selectOption("1");
    await page.locator("button:has-text('Volgende →')").click();

    // On step 4, verify submit button with correct label
    const submitButton = page.getByRole("button", { name: "Change aanmaken" });
    await expect(submitButton).toBeVisible();
  });
});
