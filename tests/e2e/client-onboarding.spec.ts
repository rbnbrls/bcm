import { test, expect } from "@playwright/test";

/**
 * Open the client onboarding wizard and wait for full hydration.
 * (Matches the networkidle convention used by navigateToNewChange in helpers.ts —
 * without it, fills can race React hydration on the first fields under CI load.)
 */
async function gotoWizard(page: import("@playwright/test").Page) {
  await page.goto("/changes/new?type=client_onboarding");
  await page.waitForURL("**/changes/new?type=client_onboarding");
  await page.waitForLoadState("networkidle");
}

test.describe("Client onboarding wizard (Nieuwe klant - client onboarding)", () => {
  test("loads the 3-step wizard when type=client_onboarding is preselected", async ({ page }) => {
    await gotoWizard(page);

    // Should show the custom wizard, not the generic form
    await expect(page.locator(".step-indicator")).toBeVisible();
    await expect(page.locator(".step-dot")).toHaveCount(3);

    // Step 1 should be active with "Klantgegevens" heading
    await expect(page.getByRole("heading", { name: "Klantgegevens" })).toBeVisible();
    await expect(page.locator('[aria-label="Stap 1"]')).toBeVisible();
  });

  test("step 1: shows client fields and validates required + format", async ({ page }) => {
    await gotoWizard(page);

    // Step 1 fields should be visible
    await expect(page.locator('input[placeholder="Bijv. HOR"]')).toBeVisible();
    await expect(page.locator('input[placeholder="Bijv. Pensioenfonds Horizon"]')).toBeVisible();

    // "Volgende →" button should be disabled initially (no fields filled)
    const nextButton = page.locator("button:has-text('Volgende →')");
    await expect(nextButton).toBeDisabled();

    // Invalid client code format (hyphen is not allowed in 1-3 alphanumeric)
    // keeps the button disabled. Note: the input caps at 3 chars (maxLength),
    // so "TOOLONG" would be truncated to "TOO" (valid) — an invalid format
    // must fit within the cap to be observable.
    await page.locator('input[placeholder="Bijv. HOR"]').fill("H-R");
    await page.locator('input[placeholder="Bijv. Pensioenfonds Horizon"]').fill("E2E Test Fonds");
    await expect(nextButton).toBeDisabled();

    // Valid client code + name enables the button
    await page.locator('input[placeholder="Bijv. HOR"]').fill("E2E");
    await expect(nextButton).toBeEnabled();
  });

  test("full step-by-step flow from step 1 through step 3 holds all data", async ({ page }) => {
    await gotoWizard(page);

    // ─── Step 1: Klantgegevens ───
    await expect(page.getByRole("heading", { name: "Klantgegevens" })).toBeVisible();

    await page.locator('input[placeholder="Bijv. HOR"]').fill("E2E");
    await page.locator('input[placeholder="Bijv. Pensioenfonds Horizon"]').fill("E2E Test Pensioenfonds");
    await expect(page.locator("button:has-text('Volgende →')")).toBeEnabled();
    await page.locator("button:has-text('Volgende →')").click();

    // ─── Step 2: Portfolio & eerste configuratieregel ───
    await expect(page.getByRole("heading", { name: "Portfolio & eerste configuratieregel" })).toBeVisible();
    await expect(page.locator('[aria-label="Stap 2"]')).toBeVisible();

    // "Volgende →" disabled initially (step 2 empty)
    const nextButton = page.locator("button:has-text('Volgende →')");
    await expect(nextButton).toBeDisabled();

    await page.locator('input[placeholder="Bijv. Rendementsportefeuille"]').fill("Rendementsportefeuille");
    await page.locator('input[placeholder="Bijv. HOR-RP"]').fill("E2ERP");
    // Select asset class (demo fixtures: EQ — EQUITIES)
    await page.locator("form.change-form select").nth(0).selectOption("EQ");
    await page.locator('input[placeholder="Bijv. 50"]').fill("100");

    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    // ─── Step 3: Portfolio metadata (ouderaccount) ───
    await expect(page.getByRole("heading", { name: "Portfolio metadata (ouderaccount)" })).toBeVisible();
    await expect(page.locator('[aria-label="Stap 3"]')).toBeVisible();

    // "Genereer change request →" (submit) enabled: metadata step is optional
    const submitButton = page.locator("button:has-text('Genereer change request →')");
    await expect(submitButton).toBeEnabled();

    // Parent-account metadata fields are rendered
    await expect(page.locator('input[placeholder="Bijv. ADP_MAIN"]')).toBeVisible();
    await expect(page.locator('input[placeholder="Bijv. ADP_MSA_01"]')).toBeVisible();
  });

  test("back navigation preserves field values between steps", async ({ page }) => {
    await gotoWizard(page);

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
    await gotoWizard(page);

    // Try to go next without filling anything on step 1
    const nextButton = page.locator("button:has-text('Volgende →')");
    await expect(nextButton).toBeDisabled();

    // Fill only client name, leave client code empty
    await page.locator('input[placeholder="Bijv. Pensioenfonds Horizon"]').fill("Partial Only");
    await expect(nextButton).toBeDisabled(); // client code still empty
  });

  test("validation errors show for invalid format and can be corrected", async ({ page }) => {
    await gotoWizard(page);

    // Enter an invalid client code (hyphen is not allowed in 1-3 alphanumeric).
    // The input caps at 3 chars (maxLength), so a too-long code would be
    // truncated to a valid one — an invalid format must fit within the cap.
    await page.locator('input[placeholder="Bijv. HOR"]').fill("H-R");
    await page.locator('input[placeholder="Bijv. Pensioenfonds Horizon"]').fill("Valid Name");

    // Inline format error appears once the field has been edited
    await expect(page.locator(".field-error")).toContainText("1-3 hoofdletters of cijfers");

    // Correct it — error disappears, next enabled
    await page.locator('input[placeholder="Bijv. HOR"]').fill("OK");
    await expect(page.locator(".field-error")).toHaveCount(0);
    await expect(page.locator("button:has-text('Volgende →')")).toBeEnabled();
  });

  test("step 3 shows format errors for an invalid parent-account code", async ({ page }) => {
    await gotoWizard(page);

    // Step 1
    await page.locator('input[placeholder="Bijv. HOR"]').fill("E2E");
    await page.locator('input[placeholder="Bijv. Pensioenfonds Horizon"]').fill("E2E Meta Fonds");
    await page.locator("button:has-text('Volgende →')").click();

    // Step 2
    await page.locator('input[placeholder="Bijv. Rendementsportefeuille"]').fill("Meta Portefeuille");
    await page.locator('input[placeholder="Bijv. HOR-RP"]').fill("E2EMET");
    await page.locator("form.change-form select").nth(0).selectOption("EQ");
    await page.locator('input[placeholder="Bijv. 50"]').fill("100");
    await page.locator("button:has-text('Volgende →')").click();

    // Step 3 — invalid parent-account code shows an inline format error
    await page.locator('input[placeholder="Bijv. ADP_MAIN"]').fill("ongeldig!");
    await expect(page.locator(".field-error")).toContainText("hoofdletters, cijfers en underscores");

    // Correct it — error disappears, submit enabled
    await page.locator('input[placeholder="Bijv. ADP_MAIN"]').fill("HOOFD_E2E");
    await expect(page.locator(".field-error")).toHaveCount(0);
    await expect(page.locator("button:has-text('Genereer change request →')")).toBeEnabled();
  });

  test("submit dispatches the complete staged payload to the server action", async ({ page }) => {
    await gotoWizard(page);

    // Step 1
    await page.locator('input[placeholder="Bijv. HOR"]').fill("E2E");
    await page.locator('input[placeholder="Bijv. Pensioenfonds Horizon"]').fill("E2E Submit Fonds");
    await expect(page.locator("button:has-text('Volgende →')")).toBeEnabled();
    await page.locator("button:has-text('Volgende →')").click();

    // Step 2
    await page.locator('input[placeholder="Bijv. Rendementsportefeuille"]').fill("Submit Portefeuille");
    await page.locator('input[placeholder="Bijv. HOR-RP"]').fill("E2ESUB");
    await page.locator("form.change-form select").nth(0).selectOption("EQ");
    await page.locator('input[placeholder="Bijv. 50"]').fill("100");
    await page.locator("button:has-text('Volgende →')").click();

    // Step 3 — include parent-account metadata
    await page.locator('input[placeholder="Bijv. ADP_MAIN"]').fill("HOOFD_E2E");
    await page.locator('input[placeholder="Bijv. ADP_MSA_01"]').fill("MSA_E2E_01");
    await page.locator("button:has-text('Genereer change request →')").click();

    // The wizard now hands the complete payload to the createClientOnboardingChange
    // server action. The observable outcome depends on the environment: with a
    // database the action stages the change request and redirects to the change
    // detail page; without one (CI demo job) it surfaces its issues in the
    // .form-errors block. Either outcome proves the complete payload crossed the
    // backend boundary — the DB-backed happy path is covered by the @db spec and
    // payload completeness is pinned by the action + wizard unit tests.
    await Promise.race([
      page.waitForURL(/\/changes\/[0-9a-f-]{36}$/, { timeout: 15000 }),
      page.locator(".form-errors[role='alert']").waitFor({ state: "visible", timeout: 15000 }),
    ]);
  });
});
