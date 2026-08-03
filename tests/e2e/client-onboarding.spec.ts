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
  test("loads the 2-step wizard when type=client_onboarding is preselected", async ({ page }) => {
    await gotoWizard(page);

    // Should show the custom wizard, not the generic form
    await expect(page.locator(".step-indicator")).toBeVisible();
    await expect(page.locator(".step-dot")).toHaveCount(2);

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

  test("full step-by-step flow from step 1 through step 2 holds all data", async ({ page }) => {
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

    // "Genereer change request →" (submit) disabled initially (step 2 empty)
    const submitButton = page.locator("button:has-text('Genereer change request →')");
    await expect(submitButton).toBeDisabled();

    await page.locator('input[placeholder="Bijv. Rendementsportefeuille"]').fill("Rendementsportefeuille");
    await page.locator('input[placeholder="Bijv. HOR-RP"]').fill("E2ERP");
    // Select asset class (demo fixtures: EQ — EQUITIES)
    await page.locator("select").nth(0).selectOption("EQ");
    await page.locator('input[placeholder="Bijv. 50"]').fill("100");

    await expect(submitButton).toBeEnabled();
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

  test("submit passes the complete staged payload to the submission callback", async ({ page }) => {
    await gotoWizard(page);

    // Capture the staged payload the wizard logs on submit. No backend is
    // wired yet (task t_7b540257), so the shell surfaces the complete
    // payload via console.log — this test pins that nothing is dropped.
    // Read the second console arg (the payload object) directly rather than
    // matching the serialized text: Chromium truncates object previews.
    const stagedPayloads: Promise<Record<string, unknown>>[] = [];
    page.on("console", (msg) => {
      if (msg.text().includes("[ClientOnboardingWizard] staged payload:")) {
        const payloadArg = msg.args()[1];
        if (payloadArg) {
          stagedPayloads.push(payloadArg.jsonValue() as Promise<Record<string, unknown>>);
        }
      }
    });

    // Step 1
    await page.locator('input[placeholder="Bijv. HOR"]').fill("E2E");
    await page.locator('input[placeholder="Bijv. Pensioenfonds Horizon"]').fill("E2E Submit Fonds");
    await expect(page.locator("button:has-text('Volgende →')")).toBeEnabled();
    await page.locator("button:has-text('Volgende →')").click();

    // Step 2
    await page.locator('input[placeholder="Bijv. Rendementsportefeuille"]').fill("Submit Portefeuille");
    await page.locator('input[placeholder="Bijv. HOR-RP"]').fill("E2ESUB");
    await page.locator("select").nth(0).selectOption("EQ");
    await page.locator('input[placeholder="Bijv. 50"]').fill("100");
    await page.locator("button:has-text('Genereer change request →')").click();

    // The complete staged payload (all 6 fields) must be available at submit
    await expect.poll(() => stagedPayloads.length).toBe(1);
    const [payload] = await Promise.all(stagedPayloads);
    expect(payload).toEqual({
      clientCode: "E2E",
      clientName: "E2E Submit Fonds",
      portfolioName: "Submit Portefeuille",
      portfolioCode: "E2ESUB",
      assetClass: "EQ",
      allocationPercentage: "100",
    });
  });
});
