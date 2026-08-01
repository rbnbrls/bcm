import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { test, expect } from "@playwright/test";

// ── Test constants: these must match seed-staged-config-e2e.mjs ────────

const DRAFT_CHANGE_ID = "00000000-0000-0000-0000-000000000001";
const SUBMITTED_CHANGE_ID = "00000000-0000-0000-0000-000000000002";
const PROCESSED_CHANGE_ID = "00000000-0000-0000-0000-000000000003";

// The seed script (seed-staged-config-e2e.mjs) recreates all three changes
// and their staged rows from a pristine state. It is idempotent: it deletes
// any existing E2E rows first, then re-inserts. Each test reseeds before it
// runs, so every test starts from clean data — this also makes CI retries
// safe after a mutating test (amend/delete) has changed a row.

const SEED_SCRIPT = join(__dirname, "seed-staged-config-e2e.mjs");

function reseedTestData() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error(
      "DATABASE_URL is required for the staged-config e2e tests. " +
        "Set it and seed the database first: npm run db:migrate && npm run db:seed",
    );
  }
  execFileSync(process.execPath, [SEED_SCRIPT], {
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: "pipe",
  });
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Navigate to a change detail page and wait for it to load.
 */
async function goToChange(page: import("@playwright/test").Page, changeId: string) {
  await page.goto(`/changes/${changeId}`);
  await page.waitForLoadState("networkidle");
  // Wait for the page to actually render the staged config or page content
  await page.waitForTimeout(500);
}

/**
 * Check if the staged config section is rendered on the page.
 * Returns the section locator.
 */
function stagedConfigSection(page: import("@playwright/test").Page) {
  return page.locator("section.staged-config-section");
}

/**
 * Get all staged row elements in the section.
 */
function stagedRows(page: import("@playwright/test").Page) {
  return page.locator("section.staged-config-section .staged-row");
}

// ── Tests ──────────────────────────────────────────────────────────────

// These tests need a real PostgreSQL database (seeded via
// seed-staged-config-e2e.mjs), so they are tagged @db and run in the
// dedicated e2e-db-test CI job (see .github/workflows/ci.yml). The regular
// e2e job excludes them with --grep-invert "@db".
test.describe("Staged config change detail UX", { tag: "@db" }, () => {
  // These tests mutate shared DB rows (amend/delete), so the file must run
  // serially. beforeEach reseeds the test data so each test starts from a
  // pristine state regardless of order or retries.
  test.describe.configure({ mode: "serial" });

  test.beforeEach(() => {
    reseedTestData();
  });

  test.describe("1. Viewing staged rows", () => {
    test("draft change shows staged config section with correct structure", async ({ page }) => {
      await goToChange(page, DRAFT_CHANGE_ID);

      // Verify the staged config section is present
      const section = stagedConfigSection(page);
      await expect(section).toBeVisible();

      // Verify the section heading
      await expect(section.locator(".eyebrow")).toContainText("CLIENT-CONFIGURATIE");
      await expect(section.locator("h2")).toContainText("IST / SOLL");

      // Verify the "diff-file" header
      await expect(section.locator(".diff-file")).toContainText("client-config/change.yaml");
    });

    test("draft change shows two staged rows with correct action badges", async ({ page }) => {
      await goToChange(page, DRAFT_CHANGE_ID);

      const rows = stagedRows(page);
      await expect(rows).toHaveCount(2);

      // First row: action type CREATE → "Aanmaken"
      const firstRow = rows.nth(0);
      await expect(firstRow.locator(".staged-action-badge")).toContainText("Aanmaken");

      // Second row: action type UPDATE → "Wijzigen"
      const secondRow = rows.nth(1);
      await expect(secondRow.locator(".staged-action-badge")).toContainText("Wijzigen");
    });

    test("draft change shows target identity and portfolio code for each row", async ({ page }) => {
      await goToChange(page, DRAFT_CHANGE_ID);

      const rows = stagedRows(page);
      await expect(rows).toHaveCount(2);

      // First row: identity format CLIENT-ASSETCLASS-SUBASSET-MANAGER
      const firstRow = rows.nth(0);
      const identity = firstRow.locator(".staged-identity");
      await expect(identity).toContainText("HOR");
      await expect(identity).toContainText("EQ");
      await expect(identity).toContainText("DEV");
      await expect(identity).toContainText("EIG");

      // Portfolio code shown
      await expect(firstRow.locator(".staged-portfolio-label")).toContainText("HORRP");
    });

    test("draft change shows field-level IST / SOLL values for each row", async ({ page }) => {
      await goToChange(page, DRAFT_CHANGE_ID);

      const rows = stagedRows(page);
      await expect(rows).toHaveCount(2);

      // First row: verify some field values
      const firstRow = rows.nth(0);
      const fieldRows = firstRow.locator(".staged-field-row");

      // The first field should be "Portfolio" with IST → SOLL (— → HORRP)
      const portfolioField = fieldRows.nth(0);
      await expect(portfolioField.locator(".staged-field-label")).toContainText("Portfolio");
      await expect(portfolioField.locator(".staged-ist-value")).toContainText("—");
      await expect(portfolioField.locator(".staged-soll-value")).toContainText("HORRP");

      // Asset class field
      const assetClassField = fieldRows.nth(2);
      await expect(assetClassField.locator(".staged-field-label")).toContainText("Asset class");
      await expect(assetClassField.locator(".staged-soll-value")).toContainText("EQ");
    });
  });

  test.describe("2. Amending a submitted change", () => {
    test("submitted change shows Wijzig button on staged rows", async ({ page }) => {
      await goToChange(page, SUBMITTED_CHANGE_ID);

      const section = stagedConfigSection(page);
      await expect(section).toBeVisible();

      // Verify the Wijzig button is visible on the row
      const editBtn = section.locator("button.staged-edit-btn");
      await expect(editBtn).toBeVisible();
      await expect(editBtn).toContainText("Wijzig");
    });

    test("clicking Wijzig opens inline edit form with all dimension fields", async ({ page }) => {
      await goToChange(page, SUBMITTED_CHANGE_ID);

      // Click the Wijzig button
      await page.locator("button.staged-edit-btn").click();
      await page.waitForTimeout(200);

      // Verify the inline edit form appears
      const editForm = page.locator("form.staged-edit-form");
      await expect(editForm).toBeVisible();

      // Verify the edit title
      await expect(editForm.locator(".staged-edit-title")).toContainText("Wijzig waarden");

      // Verify all dimension fields are present
      const expectedFields = [
        "Portfolio", "Client", "Asset class", "Sub asset class", "Manager",
        "Benchmark", "NPC classificatie", "Lange naam", "Korte naam",
        "Ingangsdatum", "Einddatum",
      ];
      const labels = editForm.locator(".staged-edit-label");
      expect(await labels.allTextContents()).toEqual(expectedFields);

      // Verify input fields exist
      const inputs = editForm.locator("input.staged-edit-input");
      await expect(inputs).toHaveCount(11);
    });

    test("can amend a field value and save successfully", async ({ page }) => {
      await goToChange(page, SUBMITTED_CHANGE_ID);

      // Click Wijzig
      await page.locator("button.staged-edit-btn").click();
      await page.waitForTimeout(200);

      // Change the "Lange naam" field
      const longNameInput = page.locator('input.staged-edit-input[name="field_long_name"]');
      await longNameInput.fill("E2E Amended Long Name");
      await page.waitForTimeout(100);

      // Click Opslaan
      await page.locator("button.staged-save-btn").click();

      // After save completes, the form auto-closes (useEffect toggles editingRowId to null
      // on successful save). Wait for the edit form to disappear.
      await expect(page.locator("form.staged-edit-form")).not.toBeVisible({ timeout: 10000 });
      await page.waitForTimeout(300);

      // The Wijzig button should be back
      await expect(page.locator("button.staged-edit-btn")).toBeVisible();

      // Page has revalidated — verify the updated value appears in the staged fields
      // (the revalidated page should show the amended long name in the SOLL column)
      await expect(page.locator(".staged-soll-value").first()).toBeVisible();
    });

    test("can cancel inline editing without changes", async ({ page }) => {
      await goToChange(page, SUBMITTED_CHANGE_ID);

      // Click Wijzig
      await page.locator("button.staged-edit-btn").click();
      await page.waitForTimeout(200);

      // Verify edit form is visible
      await expect(page.locator("form.staged-edit-form")).toBeVisible();

      // Click Annuleren
      await page.locator("button.staged-cancel-btn").click();
      await page.waitForTimeout(100);

      // Verify edit form is gone
      await expect(page.locator("form.staged-edit-form")).not.toBeVisible();

      // Verify Wijzig button returns
      await expect(page.locator("button.staged-edit-btn")).toBeVisible();
    });
  });

  test.describe("3. Deleting a staged row from a draft change", () => {
    test("draft change shows Verwijder button on staged rows", async ({ page }) => {
      await goToChange(page, DRAFT_CHANGE_ID);

      const section = stagedConfigSection(page);
      await expect(section).toBeVisible();

      // Delete buttons should be visible (draft allows delete)
      const deleteBtns = section.locator("button.staged-delete-btn");
      await expect(deleteBtns).toHaveCount(2);
    });

    test("clicking Verwijder shows two-step confirmation", async ({ page }) => {
      await goToChange(page, DRAFT_CHANGE_ID);

      // Click Verwijder on the first row
      await page.locator("button.staged-delete-btn").first().click();
      await page.waitForTimeout(200);

      // Verify the confirmation prompt appears
      const confirmPrompt = page.locator(".staged-delete-confirm");
      await expect(confirmPrompt).toBeVisible();

      // Verify "Weet je het zeker?" button
      const confirmBtn = confirmPrompt.locator("button.staged-delete-confirm-btn");
      await expect(confirmBtn).toContainText("Weet je het zeker?");

      // Verify Annuleren button
      const cancelBtn = confirmPrompt.locator("button.staged-delete-cancel-btn");
      await expect(cancelBtn).toContainText("Annuleren");
    });

    test("can cancel delete and keep the row visible", async ({ page }) => {
      await goToChange(page, DRAFT_CHANGE_ID);

      // Click Verwijder on first row
      await page.locator("button.staged-delete-btn").first().click();
      await page.waitForTimeout(200);

      // Click Annuleren
      await page.locator("button.staged-delete-cancel-btn").click();
      await page.waitForTimeout(200);

      // Verify the row is still there and delete button is back
      const rows = stagedRows(page);
      await expect(rows).toHaveCount(2);
      const deleteBtns = page.locator("button.staged-delete-btn");
      await expect(deleteBtns).toHaveCount(2);
    });

    test("can confirm delete and verify success feedback", async ({ page }) => {
      await goToChange(page, DRAFT_CHANGE_ID);

      // Count rows before delete
      const rowsBefore = await stagedRows(page).count();
      expect(rowsBefore).toBe(2);

      // Click Verwijder on first row
      await page.locator("button.staged-delete-btn").first().click();
      await page.waitForTimeout(200);

      // Confirm deletion
      await page.locator("button.staged-delete-confirm-btn").click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);

      // Verify success message
      const feedback = page.locator(".staged-edit-feedback");
      await expect(feedback).toContainText("Staged configuratie verwijderd");
    });
  });

  test.describe("4. Verifying apply outcomes on processed change", () => {
    test("processed change shows apply outcome badges for all three statuses", async ({ page }) => {
      await goToChange(page, PROCESSED_CHANGE_ID);

      const section = stagedConfigSection(page);
      await expect(section).toBeVisible();

      // Should see 3 rows
      const rows = stagedRows(page);
      await expect(rows).toHaveCount(3);

      // Check that each row has an apply-outcome badge
      const badges = section.locator(".apply-outcome-badge");
      await expect(badges).toHaveCount(3);
    });

    test("applied row shows green Toegepast badge", async ({ page }) => {
      await goToChange(page, PROCESSED_CHANGE_ID);

      const appliedRow = stagedRows(page).nth(0);
      const badge = appliedRow.locator(".apply-outcome-badge");

      await expect(badge).toBeVisible();
      await expect(badge.locator(".apply-outcome-label")).toContainText("Toegepast");
      // Should have the applied CSS class
      await expect(badge).toHaveClass(/apply-outcome-applied/);
    });

    test("skipped row shows yellow Overgeslagen badge with error", async ({ page }) => {
      await goToChange(page, PROCESSED_CHANGE_ID);

      const skippedRow = stagedRows(page).nth(1);
      const badge = skippedRow.locator(".apply-outcome-badge");

      await expect(badge).toBeVisible();
      await expect(badge.locator(".apply-outcome-label")).toContainText("Overgeslagen");
      await expect(badge).toHaveClass(/apply-outcome-skipped/);

      // Error message should be shown
      const errorMsg = badge.locator(".apply-outcome-error");
      await expect(errorMsg).toContainText("Duplicate entry already exists");
    });

    test("failed row shows red Mislukt badge with error", async ({ page }) => {
      await goToChange(page, PROCESSED_CHANGE_ID);

      const failedRow = stagedRows(page).nth(2);
      const badge = failedRow.locator(".apply-outcome-badge");

      await expect(badge).toBeVisible();
      await expect(badge.locator(".apply-outcome-label")).toContainText("Mislukt");
      await expect(badge).toHaveClass(/apply-outcome-failed/);

      // Error message should be shown
      const errorMsg = badge.locator(".apply-outcome-error");
      await expect(errorMsg).toContainText("Benchmark code not found in FactSet");
    });

    test("draft change does NOT show apply outcome badges", async ({ page }) => {
      await goToChange(page, DRAFT_CHANGE_ID);

      // Draft changes have apply_status = null, so no badges should appear
      const badges = page.locator(".apply-outcome-badge");
      await expect(badges).toHaveCount(0);
    });

    test("processed change rows show action badges alongside outcome badges", async ({ page }) => {
      await goToChange(page, PROCESSED_CHANGE_ID);

      const rows = stagedRows(page);

      // Each row should have both an action badge AND an outcome badge
      for (let i = 0; i < 3; i++) {
        const row = rows.nth(i);
        await expect(row.locator(".staged-action-badge")).toBeVisible();
        await expect(row.locator(".apply-outcome-badge")).toBeVisible();
      }

      // Check specific action types
      await expect(rows.nth(0).locator(".staged-action-badge")).toContainText("Aanmaken");
      await expect(rows.nth(1).locator(".staged-action-badge")).toContainText("Wijzigen");
      await expect(rows.nth(2).locator(".staged-action-badge")).toContainText("Beëindigen");
    });
  });
});
