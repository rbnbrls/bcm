import { test, expect } from "@playwright/test";

/**
 * DB-backed end-to-end tests for the client onboarding wizard portfolio
 * metadata integration (task t_4fbdd465).
 *
 * Exercises the complete governed metadata flow against a real PostgreSQL
 * database: navigate to the wizard → fill all three steps (client info,
 * portfolio config row, parent-account metadata) → submit → the server
 * action creates the change request AND stages portfolio + parent-account
 * metadata rows via stagePortfolioMetadataChange → the change detail page
 * renders the staged metadata section with the CREATE rows.
 *
 * Tagged @db: they run in the dedicated e2e-db-test CI job (seeded via
 * db/init.sql + db:migrate + db:seed + db:seed:client-config). The regular
 * e2e job excludes them with --grep-invert "@db".
 */

// Unique codes that do not exist in the seeded client_config tables
// (seeded clients/portfolios: HOR*, ZEK*, MET*, VRV*; parent accounts:
// PENSIOENFONDSEN / STICHTINGEN / BEDRIJFSTAKKEN).
//
// The codes are derived from a per-run random suffix so repeated runs and
// parallel workers never collide on the live tables or on open change requests
// (the staging helper rejects codes already staged in another open change).
// Client codes are limited to 3 uppercase alphanumeric chars.
const RUN_SUFFIX = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-3).padStart(3, "0");
const CLIENT_CODE = RUN_SUFFIX; // 1-3 alnum
const CLIENT_NAME = `${CLIENT_CODE} E2E Onboarding Pensioenfonds`;
const PORTFOLIO_NAME = "E2E Onboarding Portefeuille";
const PORTFOLIO_CODE = `${CLIENT_CODE}RP`;
const ASSET_CLASS = "EQ";
const ALLOCATION = "100";
const PARENT_ACCOUNT_CODE = `${CLIENT_CODE}_PA`;
const MSA_PARENT_ACCOUNT_CODE = `${CLIENT_CODE}_MSA`;

// Seeded portfolio code — used to verify the duplicate-code validation error.
const SEEDED_PORTFOLIO_CODE = "HORRP";

// ── Test suite ──────────────────────────────────────────────────────────────

test.describe("Client onboarding wizard — portfolio metadata, DB-backed", { tag: "@db" }, () => {
  test.skip(!process.env.DATABASE_URL, "DATABASE_URL is required for @db tests (seeded database)");

  async function fillAndSubmitWizard(
    page: import("@playwright/test").Page,
    opts: { parentAccountCode?: string; msaParentAccountCode?: string; portfolioCode?: string } = {},
  ) {
    await page.goto("/changes/new?type=client_onboarding");
    await page.waitForURL("**/changes/new?type=client_onboarding");
    await page.waitForLoadState("networkidle");

    // Step 1: Klantgegevens
    await page.locator('input[placeholder="Bijv. HOR"]').fill(CLIENT_CODE);
    await page.locator('input[placeholder="Bijv. Pensioenfonds Horizon"]').fill(CLIENT_NAME);
    await page.locator("button:has-text('Volgende →')").click();

    // Step 2: Portfolio & eerste configuratieregel
    await page.locator('input[placeholder="Bijv. Rendementsportefeuille"]').fill(PORTFOLIO_NAME);
    await page.locator('input[placeholder="Bijv. HOR-RP"]').fill(opts.portfolioCode ?? PORTFOLIO_CODE);
    await page.locator("select").nth(0).selectOption(ASSET_CLASS);
    await page.locator('input[placeholder="Bijv. 50"]').fill(ALLOCATION);
    await page.locator("button:has-text('Volgende →')").click();

    // Step 3: Portfolio metadata (ouderaccount)
    if (opts.parentAccountCode) {
      await page.locator('input[placeholder="Bijv. ADP_MAIN"]').fill(opts.parentAccountCode);
    }
    if (opts.msaParentAccountCode) {
      await page.locator('input[placeholder="Bijv. ADP_MSA_01"]').fill(opts.msaParentAccountCode);
    }

    // Submit and follow the redirect to the change request detail page
    await page.locator("button:has-text('Genereer change request →')").click();
    await page.waitForURL(/\/changes\/[0-9a-f-]{36}$/);
    await page.waitForLoadState("networkidle");
  }

  test("full onboarding flow creates portfolio + parent-account metadata via a change request", async ({ page }) => {
    await fillAndSubmitWizard(page, {
      parentAccountCode: PARENT_ACCOUNT_CODE,
      msaParentAccountCode: MSA_PARENT_ACCOUNT_CODE,
    });

    // Redirected to the change detail page
    await expect(page).toHaveURL(/\/changes\/[0-9a-f-]{36}$/);

    // Change request header resolves the placeholder public client that the
    // submission created for the new client code.
    const header = page.locator(".request-header");
    await expect(header).toContainText(CLIENT_NAME);

    // The staged metadata section renders BOTH rows:
    //  - portfolio CREATE (the new portfolio code)
    //  - parent_account CREATE (the new parent-account code + MSA code)
    const metadataSection = page.locator('section[aria-label="Portfolio- en ouderaccountmetadata"]');
    await expect(metadataSection).toBeVisible({ timeout: 10000 });
    await expect(metadataSection).toContainText("Portfolio · Aanmaken");
    await expect(metadataSection).toContainText(PORTFOLIO_CODE);
    await expect(metadataSection).toContainText("Ouderaccount · Aanmaken");
    await expect(metadataSection).toContainText(PARENT_ACCOUNT_CODE);
    await expect(metadataSection).toContainText(MSA_PARENT_ACCOUNT_CODE);
  });

  test("onboarding without parent-account metadata stages only the portfolio CREATE", async ({ page }) => {
    await fillAndSubmitWizard(page);

    await expect(page).toHaveURL(/\/changes\/[0-9a-f-]{36}$/);

    const metadataSection = page.locator('section[aria-label="Portfolio- en ouderaccountmetadata"]');
    await expect(metadataSection).toBeVisible({ timeout: 10000 });
    await expect(metadataSection).toContainText("Portfolio · Aanmaken");
    await expect(metadataSection).toContainText(PORTFOLIO_CODE);
    // No parent-account row when no code was provided
    await expect(metadataSection).not.toContainText("Ouderaccount · Aanmaken");
  });

  test("duplicate portfolio code surfaces the staging validation error", async ({ page }) => {
    // Use a portfolio code that already exists in the seeded data → the
    // stagePortfolioMetadataChange helper rejects it with a Dutch issue that
    // the form displays.
    await page.goto("/changes/new?type=client_onboarding");
    await page.waitForURL("**/changes/new?type=client_onboarding");
    await page.waitForLoadState("networkidle");

    await page.locator('input[placeholder="Bijv. HOR"]').fill(CLIENT_CODE);
    await page.locator('input[placeholder="Bijv. Pensioenfonds Horizon"]').fill(CLIENT_NAME);
    await page.locator("button:has-text('Volgende →')").click();

    await page.locator('input[placeholder="Bijv. Rendementsportefeuille"]').fill(PORTFOLIO_NAME);
    await page.locator('input[placeholder="Bijv. HOR-RP"]').fill(SEEDED_PORTFOLIO_CODE);
    await page.locator("select").nth(0).selectOption(ASSET_CLASS);
    await page.locator('input[placeholder="Bijv. 50"]').fill(ALLOCATION);
    await page.locator("button:has-text('Volgende →')").click();

    await page.locator("button:has-text('Genereer change request →')").click();

    // The staging validation issue is displayed in the form (no redirect)
    const errors = page.locator(".form-errors[role='alert']");
    await expect(errors).toBeVisible({ timeout: 10000 });
    await expect(errors).toContainText(`Portfolio code "${SEEDED_PORTFOLIO_CODE}" bestaat al.`);
    await expect(page).toHaveURL(/\/changes\/new/);
  });
});
