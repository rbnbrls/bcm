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
 * db/init.sql + db:migrate + db:seed). The regular
 * e2e job excludes them with --grep-invert "@db".
 */

// Seeded client_config reference values used by the wizard (see
// scripts/seed-client-config.mjs). The client/portfolio codes must be unique
// — they are derived from a per-test random suffix so parallel workers and
// repeated runs never collide on the live tables or on open change requests
// (the staging helper rejects codes already staged in another open change).
const ASSET_CLASS = "EQ";
const ALLOCATION = "100";

/** Fresh unique codes per test invocation (3-char client code + derived codes). */
function makeCodes() {
  const suffix = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-3).padStart(3, "0");
  return {
    clientCode: suffix,
    clientName: `${suffix} E2E Onboarding Pensioenfonds`,
    portfolioName: "E2E Onboarding Portefeuille",
    portfolioCode: `${suffix}RP`,
  };
}

// ── Test suite ──────────────────────────────────────────────────────────────

test.describe("Client onboarding wizard submission — DB-backed", { tag: "@db" }, () => {
  test.skip(!process.env.DATABASE_URL, "DATABASE_URL is required for @db tests (seeded database)");

  async function fillAndSubmitWizard(
    page: import("@playwright/test").Page,
    codes: ReturnType<typeof makeCodes>,
  ) {
    await page.goto("/changes/new?type=client_onboarding");
    await page.waitForURL("**/changes/new?type=client_onboarding");
    await page.waitForLoadState("networkidle");

    // Step 1: Klantgegevens
    await page.locator('input[placeholder="Bijv. HOR"]').fill(codes.clientCode);
    await page.locator('input[placeholder="Bijv. Pensioenfonds Horizon"]').fill(codes.clientName);
    await page.locator("button:has-text('Volgende →')").click();

    // Step 2: Portfolio & eerste configuratieregel
    await page.locator('input[placeholder="Bijv. Rendementsportefeuille"]').fill(codes.portfolioName);
    await page.locator('input[placeholder="Bijv. HOR-RP"]').fill(codes.portfolioCode);
    await page.locator("form.change-form select").nth(0).selectOption(ASSET_CLASS);
    await page.locator('input[placeholder="Bijv. 50"]').fill(ALLOCATION);
    await page.locator("button:has-text('Volgende →')").click();

    // Step 3: Portfolio metadata (ouderaccount) — optional, leave empty
    await page.locator("button:has-text('Genereer change request →')").click();
    await page.waitForURL(/\/changes\/[0-9a-f-]{36}$/);
    await page.waitForLoadState("networkidle");
  }

  test("submits the wizard and redirects to the change request", async ({ page }) => {
    const codes = makeCodes();
    await fillAndSubmitWizard(page, codes);

    // Redirected to the change detail page, not back to the form
    await expect(page).toHaveURL(/\/changes\/[0-9a-f-]{36}$/);

    // The change request header resolves the placeholder public client that
    // the submission created for the new client code.
    const header = page.locator(".request-header");
    await expect(header).toContainText(codes.clientName);
    await expect(page.locator(".status-pill")).toContainText("Ingediend");
  });

  test("change request shows the complete IST/SOLL diff for the onboarding payload", async ({ page }) => {
    const codes = makeCodes();
    await fillAndSubmitWizard(page, codes);

    // The IST/SOLL section renders one diff block per collected field
    const diffSection = page.locator("section.diff-section");
    await expect(diffSection).toBeVisible({ timeout: 10000 });
    await expect(diffSection.locator(".diff-block")).toHaveCount(6);

    // Client identity — IST empty (new client), SOLL carries the value
    await expect(diffSection).toContainText(codes.clientCode);
    await expect(diffSection).toContainText(codes.clientName);
    await expect(diffSection).toContainText(codes.portfolioCode);
    await expect(diffSection).toContainText(ASSET_CLASS);
    await expect(diffSection).toContainText(ALLOCATION);
  });
});
