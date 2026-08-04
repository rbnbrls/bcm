import { test, expect } from "@playwright/test";

/**
 * DB-backed end-to-end tests for the full portfolio configuration create
 * flow (`portfolio_configuration_create`).
 *
 * These tests exercise the complete happy path against a real PostgreSQL
 * database: navigate to the form → fill every field across the 4 wizard
 * steps → submit → the server action persists a change request plus a
 * staged CREATE row in client_config.change_portfolio_configuration →
 * redirect to the change request → the staged diff (IST/SOLL) is rendered.
 *
 * Tagged @db: they run in the dedicated e2e-db-test CI job (seeded via
 * db/init.sql + db:migrate + db:seed). The regular
 * e2e job excludes them with --grep-invert "@db".
 */

const FUTURE_DATE = new Date(Date.now() + 30 * 86_400_000)
  .toISOString()
  .split("T")[0];

// Seeded client_config reference values used by the form (see
// scripts/seed-client-config.mjs). HOR maps to public client
// 9f9280fc-9572-49d1-b81c-2a039652bc93 (external_reference PF-HOR-001).
const CLIENT_CODE = "HOR";
const PORTFOLIO_CODE = "HORRP";
const LONG_NAME = "E2E Create Flow Portefeuille";
const SHORT_NAME = "E2E-CR";

// ── Locator helpers ─────────────────────────────────────────────────────────

function clientSelect(page: import("@playwright/test").Page) {
  return page.locator("label.field", { hasText: "Klant" }).locator("select");
}

function benchmarkSelect(page: import("@playwright/test").Page) {
  return page.locator("label.field", { hasText: "Benchmark" }).locator("select");
}

function nextButton(page: import("@playwright/test").Page) {
  return page.getByRole("button", { name: "Volgende →" });
}

/** Fill the whole wizard with values that exist in the seeded database. */
async function createPortfolioConfiguration(page: import("@playwright/test").Page) {
  await page.goto("/changes/new?type=portfolio_configuration_create");
  await page.waitForURL("**/changes/new?type=portfolio_configuration_create");

  // Step 1: client, portfolio, names, benchmark
  await clientSelect(page).selectOption(CLIENT_CODE);
  await page.locator('input[placeholder="Bijv. ADP"]').fill(PORTFOLIO_CODE);
  await page.locator('input[placeholder="Bijv. Rendementsportefeuille aandelen"]').fill(LONG_NAME);
  await page.locator('input[placeholder="Bijv. RPA"]').fill(SHORT_NAME);
  await benchmarkSelect(page).selectOption("MSCI-WORLD-NR");
  await nextButton(page).click();

  // Step 2: dimensions (matches HORRP seed: EQ / ACX / EIG)
  await page.locator("select").nth(0).selectOption("EQUITIES");
  await page.locator("select").nth(1).selectOption("AC WORLD");
  await page.locator("select").nth(2).selectOption("EIG");
  await nextButton(page).click();

  // Step 3: NPC classification
  await page.locator("select").nth(0).selectOption("2");
  await nextButton(page).click();

  // Step 4: request metadata
  await page.locator("label.field", { hasText: "Aangevraagd door" }).locator("input").fill("E2E Test User");
  await page.locator("label.field", { hasText: "Reden" }).locator("textarea").fill("E2E create flow verification via Playwright.");
  await page.locator('input[type="date"]').fill(FUTURE_DATE);

  // Submit and follow the redirect to the change request detail page
  await page.getByRole("button", { name: "Change aanmaken" }).click();
  await page.waitForURL(/\/changes\/[0-9a-f-]{36}$/);
  await page.waitForLoadState("networkidle");
}

// ── Test suite ──────────────────────────────────────────────────────────────

test.describe("Portfolio configuration create flow — DB-backed", { tag: "@db" }, () => {
  test.skip(!process.env.DATABASE_URL, "DATABASE_URL is required for @db tests (seeded database)");

  test("submits the create form and redirects to the change request", async ({ page }) => {
    await createPortfolioConfiguration(page);

    // Redirected to the change detail page, not back to the form
    await expect(page).toHaveURL(/\/changes\/[0-9a-f-]{36}$/);

    // Change request header resolves the real client via the clients join
    const header = page.locator(".request-header");
    await expect(header).toContainText("Pensioenfonds Horizon · PF-HOR-001");
    await expect(page.locator(".status-pill")).toContainText("Ingediend");
  });

  test("change request shows the staged CREATE diff for the new portfolio", async ({ page }) => {
    await createPortfolioConfiguration(page);

    // Staged client-config section with exactly one CREATE row
    const section = page.locator("section.staged-config-section");
    await expect(section).toBeVisible({ timeout: 10000 });
    await expect(section.locator(".staged-row")).toHaveCount(1);

    const row = section.locator(".staged-row").first();
    await expect(row.locator(".staged-action-badge")).toContainText("Aanmaken");
    await expect(row.locator(".staged-identity")).toContainText("HOR-EQ-ACX-EIG");
    await expect(row.locator(".staged-portfolio-label")).toContainText(PORTFOLIO_CODE);

    // All 11 dimension fields are rendered
    await expect(row.locator(".staged-field-row")).toHaveCount(11);
  });

  test("staged diff shows IST → SOLL values for every submitted field", async ({ page }) => {
    await createPortfolioConfiguration(page);

    // Wait for the staged section to render before asserting on rows
    const section = page.locator("section.staged-config-section");
    await expect(section).toBeVisible({ timeout: 10000 });
    const row = section.locator(".staged-row").first();
    const fieldRows = row.locator(".staged-field-row");

    // CREATE rows have no IST value: every field shows "—" on the left
    const expected: Array<{ label: string; soll?: string }> = [
      { label: "Portfolio", soll: PORTFOLIO_CODE },
      { label: "Client", soll: CLIENT_CODE },
      { label: "Asset class", soll: "EQ" },
      { label: "Sub asset class", soll: "ACX" },
      { label: "Manager", soll: "EIG" },
      { label: "Benchmark", soll: "MSCI-WORLD-NR" },
      { label: "NPC classificatie", soll: "2" },
      { label: "Lange naam", soll: LONG_NAME },
      { label: "Korte naam", soll: SHORT_NAME },
      { label: "Ingangsdatum", soll: undefined }, // date formatting is locale-dependent
      { label: "Einddatum", soll: "Onbepaald" },
    ];

    // Auto-retrying count assertion (a raw count() would race the render)
    await expect(fieldRows).toHaveCount(expected.length);
    for (let i = 0; i < expected.length; i++) {
      const fieldRow = fieldRows.nth(i);
      await expect(fieldRow.locator(".staged-field-label")).toContainText(expected[i].label);
      await expect(fieldRow.locator(".staged-ist-value")).toContainText("—");
      const soll = expected[i].soll;
      if (soll !== undefined) {
        await expect(fieldRow.locator(".staged-soll-value")).toContainText(soll);
      }
    }
  });
});
