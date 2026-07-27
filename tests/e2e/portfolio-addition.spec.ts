import { test, expect } from "@playwright/test";
import {
  navigateToNewChange,
  VALID_CLIENT_ID,
} from "./helpers";

test.describe("Portfolio addition (Nieuwe portfolio toevoegen)", () => {
  test("loads the 4-step wizard when type=portfolio_addition is preselected", async ({ page }) => {
    await page.goto("/changes/new?type=portfolio_addition");
    await page.waitForURL("**/changes/new?type=portfolio_addition");

    // Should show the custom wizard, not the generic form
    await expect(page.locator(".step-indicator")).toBeVisible();
    await expect(page.locator(".step-dot")).toHaveCount(4);

    // Step 1 should be active with "Portfolio definiëren" heading
    await expect(page.getByText("Portfolio definiëren")).toBeVisible();
    await expect(page.getByText("Stap 1")).toBeVisible();
  });

  test("step 1: shows portfolio definition fields", async ({ page }) => {
    await page.goto("/changes/new?type=portfolio_addition");
    await page.waitForURL("**/changes/new?type=portfolio_addition");

    // Step 1 fields should be visible
    await expect(page.locator("label").filter({ hasText: "Cliënt" })).toBeVisible();
    await expect(page.locator("label").filter({ hasText: "Portefeuillenaam" })).toBeVisible();

    // "Volgende →" button should be disabled initially (no fields filled)
    const nextButton = page.locator("button:has-text('Volgende →')");
    await expect(nextButton).toBeDisabled();

    // Fill step 1 fields
    // Client select: first option with a value
    await page.locator("select").first().selectOption(VALID_CLIENT_ID);
    await page.locator('input[placeholder="Bijv. Rendementsportefeuille"]').fill("E2E Test Portfolio");
    await page.locator('input[placeholder="Bijv. HOR-RP"]').fill("E2E-TEST-NP");
    // Select benchmark (third select — 1 client, 1 benchmark, 1 currency)
    await page.locator("select").nth(1).selectOption("9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1");

    // "Volgende →" should now be enabled
    await expect(nextButton).toBeEnabled();
  });

  test("full step-by-step flow from step 1 through step 4", async ({ page }) => {
    await page.goto("/changes/new?type=portfolio_addition");
    await page.waitForURL("**/changes/new?type=portfolio_addition");

    // ─── Step 1: Portfolio definiëren ───
    await expect(page.getByText("Portfolio definiëren")).toBeVisible();

    // Fill step 1
    await page.locator("select").first().selectOption(VALID_CLIENT_ID);
    await page.locator('input[placeholder="Bijv. Rendementsportefeuille"]').fill("E2E Test Portfolio");
    await page.locator('input[placeholder="Bijv. HOR-RP"]').fill("E2E-TEST-NP");
    await page.locator("select").nth(1).selectOption("9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1");

    // Go to step 2
    await page.locator("button:has-text('Volgende →')").click();

    // ─── Step 2: Classificatie instellen ───
    await expect(page.getByText("Classificatie instellen")).toBeVisible();
    await expect(page.getByText("Stap 2")).toBeVisible();

    // "Volgende →" should be disabled initially (step 2 empty)
    const nextButton = page.locator("button:has-text('Volgende →')");
    await expect(nextButton).toBeDisabled();

    // Fill 4 selects on step 2 (they're consecutive <select>s)
    const selects = page.locator("select");
    // The 4 selects are WTP classification, Asset class (Klant AC), Manager, Benchmark groep
    // Select first option for each by value (not the "Kies ..." default)
    const wtpOptions = await selects.nth(2).locator("option").all();
    if (wtpOptions.length > 1) {
      await selects.nth(2).selectOption({ index: 1 });
    }
    const acOptions = await selects.nth(3).locator("option").all();
    if (acOptions.length > 1) {
      await selects.nth(3).selectOption({ index: 1 });
    }
    const managerOptions = await selects.nth(4).locator("option").all();
    if (managerOptions.length > 1) {
      await selects.nth(4).selectOption({ index: 1 });
    }
    const bgOptions = await selects.nth(5).locator("option").all();
    if (bgOptions.length > 1) {
      await selects.nth(5).selectOption({ index: 1 });
    }

    // "Volgende →" should now be enabled
    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    // ─── Step 3: AC / Sub AC bepalen ───
    await expect(page.getByText("AC en Sub AC bepalen")).toBeVisible();
    await expect(page.getByText("Stap 3")).toBeVisible();

    // The AC select and Sub AC select
    // Select AC first (EQUITIES), then Sub AC
    const acSelect = page.locator("select").nth(6);
    await acSelect.selectOption("EQUITIES");

    // Sub AC should now be enabled with options
    const subAcSelect = page.locator("select").nth(7);
    await expect(subAcSelect).toBeEnabled();
    await subAcSelect.selectOption("AC WORLD");

    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    // ─── Step 4: Controleren en activeren ───
    await expect(page.getByText("Controleren en activeren")).toBeVisible();
    await expect(page.getByText("Stap 4")).toBeVisible();

    // Verify review data is shown
    await expect(page.locator(".review-table")).toHaveCount(3);
    await expect(page.getByText("E2E Test Portfolio")).toBeVisible();
    await expect(page.getByText("E2E-TEST-NP")).toBeVisible();
    await expect(page.getByText("EQUITIES")).toBeVisible();
    await expect(page.getByText("AC WORLD")).toBeVisible();

    // Fill request details
    const futureDate = new Date(Date.now() + 30 * 86400000)
      .toISOString()
      .split("T")[0];
    await page.locator('input[name="requestedBy"]').fill("E2E Test User");
    await page.locator('input[name="effectiveDate"]').fill(futureDate);
    await page.locator('textarea[name="rationale"]').fill("E2E test portfolio addition — automated verification.");
  });

  test("shows correct cost summary on review page", async ({ page }) => {
    await page.goto("/changes/new?type=portfolio_addition");
    await page.waitForURL("**/changes/new?type=portfolio_addition");

    // Fill step 1
    await page.locator("select").first().selectOption(VALID_CLIENT_ID);
    await page.locator('input[placeholder="Bijv. Rendementsportefeuille"]').fill("Cost Test PF");
    await page.locator('input[placeholder="Bijv. HOR-RP"]').fill("COST-TEST-01");
    await page.locator("select").nth(1).selectOption("9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1");
    await page.locator("button:has-text('Volgende →')").click();

    // Fill step 2
    const selects = page.locator("select");
    const wtpOptions = await selects.nth(2).locator("option").all();
    if (wtpOptions.length > 1) await selects.nth(2).selectOption({ index: 1 });
    const acOptions = await selects.nth(3).locator("option").all();
    if (acOptions.length > 1) await selects.nth(3).selectOption({ index: 1 });
    const managerOptions = await selects.nth(4).locator("option").all();
    if (managerOptions.length > 1) await selects.nth(4).selectOption({ index: 1 });
    const bgOptions = await selects.nth(5).locator("option").all();
    if (bgOptions.length > 1) await selects.nth(5).selectOption({ index: 1 });
    await page.locator("button:has-text('Volgende →')").click();

    // Fill step 3
    await page.locator("select").nth(6).selectOption("FIXED_INCOME");
    await page.locator("select").nth(7).selectOption("SOVEREIGN EUROPE");
    await page.locator("button:has-text('Volgende →')").click();

    // Verify cost summary on step 4
    const costSummary = page.locator(".cost-summary-inline");
    await expect(costSummary).toBeVisible();
    await expect(costSummary.locator("text=€ 500 EUR")).toBeVisible();
    await expect(costSummary.locator("text=5 dagen")).toBeVisible();
    await expect(costSummary.locator("text=€500 vaste kost")).toBeVisible();
  });

  test("back navigation preserves field values between steps", async ({ page }) => {
    await page.goto("/changes/new?type=portfolio_addition");
    await page.waitForURL("**/changes/new?type=portfolio_addition");

    // Fill step 1
    await page.locator("select").first().selectOption(VALID_CLIENT_ID);
    await page.locator('input[placeholder="Bijv. Rendementsportefeuille"]').fill("Back Nav Test");
    await page.locator('input[placeholder="Bijv. HOR-RP"]').fill("BACK-TEST-01");
    await page.locator("select").nth(1).selectOption("9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1");
    await page.locator("button:has-text('Volgende →')").click();

    // Now on step 2 — go back
    await page.locator("button:has-text('← Vorige')").click();

    // Should be back on step 1 with values preserved
    await expect(page.getByText("Portfolio definiëren")).toBeVisible();
    await expect(page.locator('input[placeholder="Bijv. Rendementsportefeuille"]')).toHaveValue("Back Nav Test");
    await expect(page.locator('input[placeholder="Bijv. HOR-RP"]')).toHaveValue("BACK-TEST-01");
    expect(await page.locator("select").first().inputValue()).toBe(VALID_CLIENT_ID);
  });

  test("step navigation is blocked on incomplete required fields", async ({ page }) => {
    await page.goto("/changes/new?type=portfolio_addition");
    await page.waitForURL("**/changes/new?type=portfolio_addition");

    // Try to go next without filling anything on step 1
    const nextButton = page.locator("button:has-text('Volgende →')");
    await expect(nextButton).toBeDisabled();

    // Fill only name, leave client and benchmark empty
    await page.locator('input[placeholder="Bijv. Rendementsportefeuille"]').fill("Partial Only");
    await expect(nextButton).toBeDisabled(); // client_id and benchmark still empty
  });

  test("submit button shows on step 4 with correct label", async ({ page }) => {
    await page.goto("/changes/new?type=portfolio_addition");
    await page.waitForURL("**/changes/new?type=portfolio_addition");

    // Navigate through all steps with minimal valid data
    // Step 1
    await page.locator("select").first().selectOption(VALID_CLIENT_ID);
    await page.locator('input[placeholder="Bijv. Rendementsportefeuille"]').fill("Submit Test PF");
    await page.locator('input[placeholder="Bijv. HOR-RP"]').fill("SUBMIT-TEST-01");
    await page.locator("select").nth(1).selectOption("9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1");
    await page.locator("button:has-text('Volgende →')").click();

    // Step 2
    const selects = page.locator("select");
    const wOpts = await selects.nth(2).locator("option").all();
    if (wOpts.length > 1) await selects.nth(2).selectOption({ index: 1 });
    const aOpts = await selects.nth(3).locator("option").all();
    if (aOpts.length > 1) await selects.nth(3).selectOption({ index: 1 });
    const mOpts = await selects.nth(4).locator("option").all();
    if (mOpts.length > 1) await selects.nth(4).selectOption({ index: 1 });
    const bOpts = await selects.nth(5).locator("option").all();
    if (bOpts.length > 1) await selects.nth(5).selectOption({ index: 1 });
    await page.locator("button:has-text('Volgende →')").click();

    // Step 3
    await page.locator("select").nth(6).selectOption("ALTERNATIVES");
    await page.locator("select").nth(7).selectOption("HEDGE FUNDS");
    await page.locator("button:has-text('Volgende →')").click();

    // On step 4, verify submit button
    const submitButton = page.locator("button[type='submit']");
    await expect(submitButton).toContainText("Genereer change request →");
    await expect(submitButton).toBeVisible();
  });
});
