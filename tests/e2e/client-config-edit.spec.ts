import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { test, expect } from "@playwright/test";

/**
 * E2E coverage for the per-row edit affordance on /admin/client-config
 * (issue #274 task 1 — t_bad2c8ad).
 *
 * The client_config portfolio seed inserts 0 rows in CI today (NPC name→id
 * mapping bug in seed-client-config.mjs), so each test seeds exactly one
 * known portfolio_configuration row via seed-client-config-edit-e2e.mjs and
 * targets it by its stable identity (primaryAccountId).
 *
 * Requires a seeded database (db:migrate + db:seed:client-config), so the
 * spec is tagged @db and runs in the dedicated e2e-db-test CI job.
 */
test.describe("Client config table edit affordance", { tag: "@db" }, () => {
  const SEED_SCRIPT = join(__dirname, "seed-client-config-edit-e2e.mjs");

  /** primaryAccountId of the seeded test row, set by beforeEach. */
  let primaryAccountId = "";

  /** Re-seed the single test row and store its primaryAccountId. */
  function reseedTestRow(): void {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error(
        "DATABASE_URL is required for the client-config edit e2e tests. " +
          "Set it and seed the database first: npm run db:migrate && npm run db:seed:client-config",
      );
    }
    const stdout = execFileSync(process.execPath, [SEED_SCRIPT], {
      env: { ...process.env, DATABASE_URL: dbUrl },
      encoding: "utf8",
      stdio: "pipe",
    });
    const id = stdout.trim().split("\n").pop() ?? "";
    if (!id) throw new Error("seed script did not return a primary_account_id");
    primaryAccountId = id;
  }

  test.beforeEach(() => {
    reseedTestRow();
  });

  test("the seeded row has a clickable edit trigger that opens the wizard with the row identity", async ({ page }) => {
    await page.goto("/admin/client-config");
    await page.waitForLoadState("networkidle");

    const table = page.locator("table.config-table");
    await expect(table).toBeVisible();

    // Actions column header exists
    await expect(table.locator("thead th").filter({ hasText: "Acties" })).toBeVisible();

    // Every visible data row exposes an edit trigger carrying its stable identity
    const dataRows = table.locator("tbody tr");
    const rowCount = await dataRows.count();
    expect(rowCount).toBeGreaterThan(0);
    for (let i = 0; i < rowCount; i++) {
      const row = dataRows.nth(i);
      const editBtn = row.locator("button.config-edit-btn");
      await expect(editBtn).toBeVisible();
      const rowId = (await row.locator("td").nth(1).locator("b").textContent())?.trim() ?? "";
      expect(rowId).not.toBe("");
      await expect(editBtn).toHaveAttribute("data-edit-row", rowId);
    }

    // The seeded row is present and its trigger passes the stable identity
    const seededRow = table.locator(`tr:has(button[data-edit-row="${primaryAccountId}"])`);
    await expect(seededRow).toBeVisible();

    // Click the trigger: the wizard opens with that identity
    await seededRow.locator("button.config-edit-btn").click();
    const wizard = page.locator("section.config-edit-wizard");
    await expect(wizard).toBeVisible();
    await expect(wizard).toContainText(primaryAccountId);
    await expect(wizard.getByRole("heading", { name: "Wijzig rij" })).toBeVisible();
  });

  test("wizard opens prefilled with the row's current values (IST state)", async ({ page }) => {
    const today = new Date().toISOString().split("T")[0];

    await page.goto("/admin/client-config");
    await page.waitForLoadState("networkidle");

    const seededRow = page.locator(
      `table.config-table tr:has(button[data-edit-row="${primaryAccountId}"])`,
    );
    await expect(seededRow).toBeVisible();
    await seededRow.locator("button.config-edit-btn").click();

    const wizard = page.locator("section.config-edit-wizard");
    await expect(wizard).toBeVisible();

    // IST preview reflects the seeded row's values for the mutable fields
    await expect(wizard.getByTestId("ist-field-longName")).toHaveText("E2E EDIT AFFORDANCE TEST ROW");
    await expect(wizard.getByTestId("ist-field-shortName")).toHaveText("E2E-EDIT");
    await expect(wizard.getByTestId("ist-field-effectiveFrom")).toHaveText(today);
    for (const key of [
      "portfolioCode",
      "assetClassCode",
      "subAssetClassCode",
      "managerCode",
      "benchmarkCode",
      "npcClassificationId",
    ]) {
      await expect(wizard.getByTestId(`ist-field-${key}`)).not.toHaveText("");
    }

    // Wizard can be dismissed again
    await wizard.getByRole("button", { name: "Sluit wijzig wizard" }).click();
    await expect(wizard).toBeHidden();
  });
});
