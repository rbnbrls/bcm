import { test, expect } from "@playwright/test";

/**
 * End-to-end tests for the explicit-client portfolio configuration create
 * flow (`portfolio_configuration_create`, rendered by
 * PortfolioConfigurationCreateForm → the shared 4-step wizard with
 * `requireClient`).
 *
 * These tests run WITHOUT a database (demo/fixture mode, regular e2e CI
 * job). They cover form navigation, filling every field, client-side
 * required-field validation and server-side client validation. The
 * DB-backed full submission flow (submit → staged diff on the change
 * request) lives in portfolio-configuration-create-db.spec.ts (@db tag).
 */

const FUTURE_DATE = new Date(Date.now() + 30 * 86_400_000)
  .toISOString()
  .split("T")[0];

// ── Locator helpers ─────────────────────────────────────────────────────────

/** The explicit client <select> on step 1 (label text "Klant"). */
function clientSelect(page: import("@playwright/test").Page) {
  return page.locator("label.field", { hasText: "Klant" }).locator("select");
}

/** The benchmark <select> on step 1 (label text "Benchmark"). */
function benchmarkSelect(page: import("@playwright/test").Page) {
  return page.locator("label.field", { hasText: "Benchmark" }).locator("select");
}

/** The "Volgende →" primary button on the current step. */
function nextButton(page: import("@playwright/test").Page) {
  return page.getByRole("button", { name: "Volgende →" });
}

/**
 * Fill step 1 with the demo-fixture HOR client. `client` may be "" to test
 * the missing-required-client case.
 */
async function fillStep1(page: import("@playwright/test").Page, client = "HOR") {
  if (client) await clientSelect(page).selectOption(client);
  await page.locator('input[placeholder="Bijv. ADP"]').fill("HORRP");
  await page.locator('input[placeholder="Bijv. Rendementsportefeuille aandelen"]').fill("E2E Create Flow Portefeuille");
  await page.locator('input[placeholder="Bijv. RPA"]').fill("E2E-CR");
  await benchmarkSelect(page).selectOption("MSCI-WORLD-NR");
}

/** Navigate through steps 2 and 3 with demo-fixture dimension values. */
async function fillSteps2And3(page: import("@playwright/test").Page) {
  await nextButton(page).click();
  await page.locator("select").nth(0).selectOption("EQUITIES");
  await page.locator("select").nth(1).selectOption("AC WORLD");
  await page.locator("select").nth(2).selectOption("OWN");
  await nextButton(page).click();
  await page.locator("select").nth(0).selectOption("2");
  await nextButton(page).click();
}

/** Fill step 4 request metadata (requester, rationale, effective date). */
async function fillStep4(page: import("@playwright/test").Page) {
  await page.locator("label.field", { hasText: "Aangevraagd door" }).locator("input").fill("E2E Test User");
  await page.locator("label.field", { hasText: "Reden" }).locator("textarea").fill("E2E create flow verification via Playwright.");
  await page.locator('input[type="date"]').fill(FUTURE_DATE);
}

/** Complete the whole wizard (steps 1-4) with valid demo-fixture data. */
async function completeWizard(page: import("@playwright/test").Page) {
  await fillStep1(page);
  await fillSteps2And3(page);
  await fillStep4(page);
}

// ── Test suite ──────────────────────────────────────────────────────────────

test.describe("Portfolio configuration create flow (portfolio_configuration_create)", () => {
  test("loads the explicit-client create wizard when preselected", async ({ page }) => {
    await page.goto("/changes/new?type=portfolio_configuration_create");
    await page.waitForURL("**/changes/new?type=portfolio_configuration_create");

    // Custom 4-step wizard, not the generic form
    await expect(page.locator(".step-indicator")).toBeVisible();
    await expect(page.locator(".step-dot")).toHaveCount(4);
    await expect(page.getByRole("heading", { name: "Portfolio definiëren" })).toBeVisible();

    // Explicit client selection is shown and required (requireClient mode)
    await expect(clientSelect(page)).toBeVisible();
    await expect(clientSelect(page).locator("option").first()).toHaveText("Kies klant");
    await expect(page.getByText("Kies een bestaande klant en stel de nieuwe portefeuille in")).toBeVisible();
  });

  test("client dropdown lists client_config clients", async ({ page }) => {
    await page.goto("/changes/new?type=portfolio_configuration_create");
    await page.waitForURL("**/changes/new?type=portfolio_configuration_create");

    const options = clientSelect(page).locator("option");
    await expect(options).toHaveCount(3); // placeholder + HOR + ZEK (demo fixtures)
    await expect(clientSelect(page).locator('option[value="HOR"]')).toHaveText("HOR — Pensioenfonds Horizon");
    await expect(clientSelect(page).locator('option[value="ZEK"]')).toHaveText("ZEK — Stichting Pensioen Zeker");
  });

  test("requires a client and all step-1 fields before navigation is allowed", async ({ page }) => {
    await page.goto("/changes/new?type=portfolio_configuration_create");
    await page.waitForURL("**/changes/new?type=portfolio_configuration_create");

    // Nothing filled → next disabled
    await expect(nextButton(page)).toBeDisabled();

    // Fill everything EXCEPT the required client → still disabled
    await fillStep1(page, ""); // client stays on "Kies klant"
    await expect(clientSelect(page)).toHaveValue("");
    await expect(nextButton(page)).toBeDisabled();

    // Selecting the client enables navigation
    await clientSelect(page).selectOption("HOR");
    await expect(nextButton(page)).toBeEnabled();
  });

  test("selecting a client prefills the portfolio code and shows suggestions", async ({ page }) => {
    await page.goto("/changes/new?type=portfolio_configuration_create");
    await page.waitForURL("**/changes/new?type=portfolio_configuration_create");

    // Pick HOR while portfolio code is empty → prefilled with the client code
    await clientSelect(page).selectOption("HOR");
    await expect(page.locator('input[placeholder="Bijv. ADP"]')).toHaveValue("HOR");

    // A datalist with the client's active portfolios is rendered (the
    // portfolio code lives in the option value, not its text content)
    const datalist = page.locator("datalist#portfolio-suggestions option");
    await expect(datalist).toHaveCount(2);
    await expect(datalist.first()).toHaveAttribute("value", "HORRP");
  });

  test("blocks navigation on incomplete step 2 and step 3 required fields", async ({ page }) => {
    await page.goto("/changes/new?type=portfolio_configuration_create");
    await page.waitForURL("**/changes/new?type=portfolio_configuration_create");

    await fillStep1(page);
    await nextButton(page).click();
    await expect(page.getByRole("heading", { name: "Dimensies instellen" })).toBeVisible();

    // Step 2 empty → next disabled
    await expect(nextButton(page)).toBeDisabled();

    // Asset class without sub asset class → still disabled
    await page.locator("select").nth(0).selectOption("EQUITIES");
    await expect(nextButton(page)).toBeDisabled();

    // Complete step 2 → enabled; move to step 3
    await page.locator("select").nth(1).selectOption("AC WORLD");
    await page.locator("select").nth(2).selectOption("OWN");
    await expect(nextButton(page)).toBeEnabled();
    await nextButton(page).click();

    // Step 3 empty → next disabled; NPC selection enables it
    await expect(page.getByRole("heading", { name: "NPC classificatie" })).toBeVisible();
    await expect(nextButton(page)).toBeDisabled();
    await page.locator("select").nth(0).selectOption("2");
    await expect(nextButton(page)).toBeEnabled();
  });

  test("fills all steps and shows the complete summary on step 4", async ({ page }) => {
    await page.goto("/changes/new?type=portfolio_configuration_create");
    await page.waitForURL("**/changes/new?type=portfolio_configuration_create");

    await completeWizard(page);

    await expect(page.getByRole("heading", { name: "Controleren en verzenden" })).toBeVisible();
    const summary = page.locator(".summary-box");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("HOR — Pensioenfonds Horizon");
    await expect(summary).toContainText("HORRP — E2E Create Flow Portefeuille (E2E-CR)");
    await expect(summary).toContainText("MSCI-WORLD-NR — MSCI World Net Return");
    await expect(summary).toContainText("EQUITIES / AC WORLD");
    await expect(summary).toContainText("EIGEN BEHEER (OWN)");

    // Submit button is present and enabled on step 4
    await expect(page.getByRole("button", { name: "Change aanmaken" })).toBeEnabled();
  });

  test("rejects an unknown client code with a server validation error", async ({ page }) => {
    await page.goto("/changes/new?type=portfolio_configuration_create");
    await page.waitForURL("**/changes/new?type=portfolio_configuration_create");

    await completeWizard(page);

    // Tamper the hidden clientCode input to a client that does not exist in
    // the reference data (all dropdown options are valid by construction, so
    // this exercises the server-side client validation path).
    await page.locator('input[name="clientCode"]').evaluate((el: HTMLInputElement) => {
      el.value = "XXX";
    });

    await page.getByRole("button", { name: "Change aanmaken" }).click();

    const banner = page.locator(".error-banner[role='alert']");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Client "XXX" bestaat niet in de referentiedata.');
  });

  test("surfaces a graceful error when submitting without a database", async ({ page }) => {
    await page.goto("/changes/new?type=portfolio_configuration_create");
    await page.waitForURL("**/changes/new?type=portfolio_configuration_create");

    await completeWizard(page);
    await page.getByRole("button", { name: "Change aanmaken" }).click();

    // Demo mode has no database: the server action must surface the failure
    // in the form's error banner instead of crashing the page.
    const banner = page.locator(".error-banner[role='alert']");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Database niet bereikbaar");
    await expect(page).toHaveURL(/\/changes\/new/);
  });
});
