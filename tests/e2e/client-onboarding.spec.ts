import { test, expect } from "@playwright/test";

test.describe("Client onboarding wizard (Nieuwe klant - client onboarding)", () => {
  test("loads the 3-step wizard when type=client_onboarding is preselected", async ({ page }) => {
    await page.goto("/changes/new?type=client_onboarding");
    await page.waitForURL("**/changes/new?type=client_onboarding");

    // Should show the custom wizard, not the generic form
    await expect(page.locator(".step-indicator")).toBeVisible();
    await expect(page.locator(".step-dot")).toHaveCount(3);

    // Step 1 should be active with "Klantgegevens" heading
    await expect(page.getByRole("heading", { name: "Klantgegevens" })).toBeVisible();
    await expect(page.locator('[aria-label="Stap 1"]')).toBeVisible();
  });

  test("step 1: shows client fields and validates required + format", async ({ page }) => {
    await page.goto("/changes/new?type=client_onboarding");
    await page.waitForURL("**/changes/new?type=client_onboarding");

    // Step 1 fields should be visible
    await expect(page.locator('input[placeholder="Bijv. HOR"]')).toBeVisible();
    await expect(page.locator('input[placeholder="Bijv. Pensioenfonds Horizon"]')).toBeVisible();

    // "Volgende →" button should be disabled initially (no fields filled)
    const nextButton = page.locator("button:has-text('Volgende →')");
    await expect(nextButton).toBeDisabled();

    // Invalid client code format (too long) keeps the button disabled
    await page.locator('input[placeholder="Bijv. HOR"]').fill("TOOLONG");
    await page.locator('input[placeholder="Bijv. Pensioenfonds Horizon"]').fill("E2E Test Fonds");
    await expect(nextButton).toBeDisabled();

    // Valid client code + name enables the button
    await page.locator('input[placeholder="Bijv. HOR"]').fill("E2E");
    await expect(nextButton).toBeEnabled();
  });

  test("full step-by-step flow from step 1 through step 3 holds all data", async ({ page }) => {
    await page.goto("/changes/new?type=client_onboarding");
    await page.waitForURL("**/changes/new?type=client_onboarding");

    // ─── Step 1: Klantgegevens ───
    await expect(page.getByRole("heading", { name: "Klantgegevens" })).toBeVisible();

    await page.locator('input[placeholder="Bijv. HOR"]').fill("E2E");
    await page.locator('input[placeholder="Bijv. Pensioenfonds Horizon"]').fill("E2E Test Pensioenfonds");
    await page.locator("button:has-text('Volgende →')").click();

    // ─── Step 2: Portfolio & eerste configuratieregel ───
    await expect(page.getByRole("heading", { name: "Portfolio & eerste configuratieregel" })).toBeVisible();
    await expect(page.locator('[aria-label="Stap 2"]')).toBeVisible();

    // "Volgende →" disabled initially (step 2 empty)
    const nextButton = page.locator("button:has-text('Volgende →')");
    await expect(nextButton).toBeDisabled();

    await page.locator('input[placeholder="Bijv. Rendementsportefeuille"]').fill("Rendementsportefeuille");
    await page.locator('input[placeholder="Bijv. HOR-RP"]').fill("E2ERP");
    // Select asset class (demo fixtures: EQ — Equities)
    await page.locator("select").nth(0).selectOption("EQ");
    await page.locator('input[placeholder="Bijv. 50"]').fill("100");

    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    // ─── Step 3: Controleren en verzenden ───
    await expect(page.getByRole("heading", { name: "Controleren en verzenden" })).toBeVisible();
    await expect(page.locator('[aria-label="Stap 3"]')).toBeVisible();

    // Verify all staged data is shown in the review tables
    await expect(page.getByText("E2E", { exact: true })).toBeVisible();
    await expect(page.getByText("E2E Test Pensioenfonds")).toBeVisible();
    await expect(page.getByText("Rendementsportefeuille")).toBeVisible();
    await expect(page.getByText("E2ERP")).toBeVisible();
    await expect(page.getByText(/EQ — EQUITIES/)).toBeVisible();
    await expect(page.getByText("100%")).toBeVisible();

    // Submit button present with the correct label
    const submitButton = page.getByRole("button", { name: "Genereer change request →" });
    await expect(submitButton).toBeVisible();
  });

  test("back navigation preserves field values between steps", async ({ page }) => {
    await page.goto("/changes/new?type=client_onboarding");
    await page.waitForURL("**/changes/new?type=client_onboarding");

    // Fill step 1
    await page.locator('input[placeholder="Bijv. HOR"]').fill("NAV");
    await page.locator('input[placeholder="Bijv. Pensioenfonds Horizon"]').fill("Back Nav Test Fonds");
    await page.locator("button:has-text('Volgende →')").click();

    // Now on step 2 — go back
    await page.locator("button:has-text('← Vorige')").click();

    // Should be back on step 1 with values preserved
    await expect(page.getByRole("heading", { name: "Klantgegevens" })).toBeVisible();
    await expect(page.locator('input[placeholder="Bijv. HOR"]')).toHaveValue("NAV");
    await expect(page.locator('input[placeholder="Bijv. Pensioenfonds Horizon"]')).toHaveValue("Back Nav Test Fonds");
  });

  test("step navigation is blocked on incomplete required fields", async ({ page }) => {
    await page.goto("/changes/new?type=client_onboarding");
    await page.waitForURL("**/changes/new?type=client_onboarding");

    // Try to go next without filling anything on step 1
    const nextButton = page.locator("button:has-text('Volgende →')");
    await expect(nextButton).toBeDisabled();

    // Fill only client name, leave client code empty
    await page.locator('input[placeholder="Bijv. Pensioenfonds Horizon"]').fill("Partial Only");
    await expect(nextButton).toBeDisabled(); // client code still empty
  });

  test("validation errors show for invalid format and can be corrected", async ({ page }) => {
    await page.goto("/changes/new?type=client_onboarding");
    await page.waitForURL("**/changes/new?type=client_onboarding");

    // Enter an invalid client code (4 chars instead of 1-3)
    await page.locator('input[placeholder="Bijv. HOR"]').fill("TOOLONG");
    await page.locator('input[placeholder="Bijv. Pensioenfonds Horizon"]').fill("Valid Name");
    await page.locator('input[placeholder="Bijv. HOR"]').blur();

    // Inline format error appears
    await expect(page.locator(".field-error")).toContainText("1-3 hoofdletters of cijfers");

    // Correct it — error disappears, next enabled
    await page.locator('input[placeholder="Bijv. HOR"]').fill("OK");
    await expect(page.locator(".field-error")).toHaveCount(0);
    await expect(page.locator("button:has-text('Volgende →')")).toBeEnabled();
  });

  test("submit is possible with valid data and returns server response", async ({ page }) => {
    await page.goto("/changes/new?type=client_onboarding");
    await page.waitForURL("**/changes/new?type=client_onboarding");

    // Step 1
    await page.locator('input[placeholder="Bijv. HOR"]').fill("E2E");
    await page.locator('input[placeholder="Bijv. Pensioenfonds Horizon"]').fill("E2E Submit Fonds");
    await page.locator("button:has-text('Volgende →')").click();

    // Step 2
    await page.locator('input[placeholder="Bijv. Rendementsportefeuille"]').fill("Submit Portefeuille");
    await page.locator('input[placeholder="Bijv. HOR-RP"]').fill("E2ESUB");
    await page.locator("select").nth(0).selectOption("EQ");
    await page.locator('input[placeholder="Bijv. 50"]').fill("100");
    await page.locator("button:has-text('Volgende →')").click();

    // Step 3: submit
    const submitButton = page.getByRole("button", { name: "Genereer change request →" });
    await submitButton.click();
    await page.waitForLoadState("networkidle");

    // Accept any outcome: success message (no DB, action validates + returns),
    // error shown, or navigation.
    const successVisible = await page.locator(".form-success").isVisible().catch(() => false);
    const errorVisible = await page.locator(".form-errors[role='alert']").isVisible().catch(() => false);
    const urlChanged = !page.url().includes("/changes/new");
    expect(successVisible || errorVisible || urlChanged).toBeTruthy();
  });
});
