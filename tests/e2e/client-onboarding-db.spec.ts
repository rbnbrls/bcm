import { test, expect } from "@playwright/test";

/**
 * DB-backed end-to-end tests for the client onboarding wizard submission
 * (task t_7b540257).
 *
 * Exercises the complete happy path against a real PostgreSQL database:
 * navigate to the wizard → fill both steps with values that exist in the
 * seeded reference data (unique client/portfolio codes) → submit → the
 * server action creates the change request with complete IST/SOLL fields →
 * redirect to the change request → the staged IST/SOLL diff is rendered.
 *
 * Tagged @db: they run in the dedicated e2e-db-test CI job (seeded via
 * db/init.sql + db:migrate + db:seed + db:seed:client-config). The regular
 * e2e job excludes them with --grep-invert "@db".
 */

// Seeded client_config reference values used by the wizard (see
// scripts/seed-client-config.mjs). The client/portfolio codes must be unique
// — QZ9 does not exist in the seeded client_config.client/portfolio tables.
const CLIENT_CODE = "QZ9";
const CLIENT_NAME = "QZ9 E2E Onboarding Pensioenfonds";
const PORTFOLIO_NAME = "E2E Onboarding Portefeuille";
const PORTFOLIO_CODE = "QZ9RP";
const ASSET_CLASS = "EQ";
const ALLOCATION = "100";

// ── Test suite ──────────────────────────────────────────────────────────────

test.describe("Client onboarding wizard submission — DB-backed", { tag: "@db" }, () => {
  test.skip(!process.env.DATABASE_URL, "DATABASE_URL is required for @db tests (seeded database)");

  async function fillAndSubmitWizard(page: import("@playwright/test").Page) {
    await page.goto("/changes/new?type=client_onboarding");
    await page.waitForURL("**/changes/new?type=client_onboarding");
    await page.waitForLoadState("networkidle");

    // Step 1: Klantgegevens
    await page.locator('input[placeholder="Bijv. HOR"]').fill(CLIENT_CODE);
    await page.locator('input[placeholder="Bijv. Pensioenfonds Horizon"]').fill(CLIENT_NAME);
    await page.locator("button:has-text('Volgende →')").click();

    // Step 2: Portfolio & eerste configuratieregel
    await page.locator('input[placeholder="Bijv. Rendementsportefeuille"]').fill(PORTFOLIO_NAME);
    await page.locator('input[placeholder="Bijv. HOR-RP"]').fill(PORTFOLIO_CODE);
    await page.locator("select").nth(0).selectOption(ASSET_CLASS);
    await page.locator('input[placeholder="Bijv. 50"]').fill(ALLOCATION);

    // Submit and follow the redirect to the change request detail page
    await page.locator("button:has-text('Genereer change request →')").click();
    await page.waitForURL(/\/changes\/[0-9a-f-]{36}$/);
    await page.waitForLoadState("networkidle");
  }

  test("submits the wizard and redirects to the change request", async ({ page }) => {
    await fillAndSubmitWizard(page);

    // Redirected to the change detail page, not back to the form
    await expect(page).toHaveURL(/\/changes\/[0-9a-f-]{36}$/);

    // The change request header resolves the placeholder public client that
    // the submission created for the new client code.
    const header = page.locator(".request-header");
    await expect(header).toContainText(CLIENT_NAME);
    await expect(page.locator(".status-pill")).toContainText("Ingediend");
  });

  test("change request shows the complete IST/SOLL diff for the onboarding payload", async ({ page }) => {
    await fillAndSubmitWizard(page);

    // The IST/SOLL section renders one diff block per collected field
    const diffSection = page.locator("section.diff-section");
    await expect(diffSection).toBeVisible({ timeout: 10000 });
    await expect(diffSection.locator(".diff-block")).toHaveCount(6);

    // Client identity — IST empty (new client), SOLL carries the value
    await expect(diffSection).toContainText(CLIENT_CODE);
    await expect(diffSection).toContainText(CLIENT_NAME);
    await expect(diffSection).toContainText(PORTFOLIO_CODE);
    await expect(diffSection).toContainText(ASSET_CLASS);
    await expect(diffSection).toContainText(ALLOCATION);
  });
});
