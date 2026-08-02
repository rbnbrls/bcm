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

  test("the seeded row has a clickable edit trigger that opens the wizard with the row identity", async ({
    page,
  }) => {
    await page.goto("/admin/client-config");
    await page.waitForLoadState("networkidle");

    const table = page.locator("table.config-table");
    await expect(table).toBeVisible();

    // Actions column header exists
    await expect(
      table.locator("thead th").filter({ hasText: "Acties" }),
    ).toBeVisible();

    // Every visible data row exposes an edit trigger carrying its stable identity
    const dataRows = table.locator("tbody tr");
    const rowCount = await dataRows.count();
    expect(rowCount).toBeGreaterThan(0);
    for (let i = 0; i < rowCount; i++) {
      const row = dataRows.nth(i);
      const editBtn = row.locator("button.config-edit-btn");
      await expect(editBtn).toBeVisible();
      const rowId =
        (await row.locator("td").nth(1).locator("b").textContent())?.trim() ??
        "";
      expect(rowId).not.toBe("");
      await expect(editBtn).toHaveAttribute("data-edit-row", rowId);
    }

    // The seeded row is present and its trigger passes the stable identity
    const seededRow = table.locator(
      `tr:has(button[data-edit-row="${primaryAccountId}"])`,
    );
    await expect(seededRow).toBeVisible();

    // Click the trigger: the wizard opens with that identity
    await seededRow.locator("button.config-edit-btn").click();
    const wizard = page.locator("section.config-edit-wizard");
    await expect(wizard).toBeVisible();
    await expect(wizard).toContainText(primaryAccountId);
    await expect(
      wizard.getByRole("heading", { name: "Wijzig rij" }),
    ).toBeVisible();
  });

  test("wizard opens prefilled with the row's current values (IST state)", async ({
    page,
  }) => {
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

    // IST fields render as editable inputs prefilled with the seeded row's
    // values for the mutable fields
    await expect(wizard.getByTestId("ist-field-longName")).toHaveValue(
      "E2E EDIT AFFORDANCE TEST ROW",
    );
    await expect(wizard.getByTestId("ist-field-shortName")).toHaveValue(
      "E2E-EDIT",
    );
    await expect(wizard.getByTestId("ist-field-effectiveFrom")).toHaveValue(
      today,
    );
    for (const key of [
      "portfolioCode",
      "assetClassCode",
      "subAssetClassCode",
      "managerCode",
      "benchmarkCode",
      "npcClassificationId",
    ]) {
      await expect(wizard.getByTestId(`ist-field-${key}`)).not.toHaveValue("");
    }

    // Every mutable field is editable (an input, not a read-only preview)
    const editableKeys = [
      "portfolioCode",
      "assetClassCode",
      "subAssetClassCode",
      "managerCode",
      "benchmarkCode",
      "npcClassificationId",
      "longName",
      "shortName",
      "effectiveFrom",
    ];
    for (const key of editableKeys) {
      const field = wizard.getByTestId(`ist-field-${key}`);
      await expect(field).toBeEditable();
    }

    // The wizard exposes a 'Submit Change Request' button
    await expect(wizard.getByTestId("submit-change-request")).toBeVisible();

    // Wizard can be dismissed again
    await wizard.getByRole("button", { name: "Sluit wijzig wizard" }).click();
    await expect(wizard).toBeHidden();
  });

  test("submitting the update wizard persists a change request with a REAL client_id (FK fix t_1b31ea3a)", async ({
    page,
  }) => {
    // The seeded row's client_code resolves to a real public clients row
    // (external_reference "PF-<CODE>-<NNN>"), so the persisted change
    // request must reference that real clients.id — never a random
    // placeholder UUID (change_requests_client_id_fkey violation).
    const dbUrl = process.env.DATABASE_URL!;
    const { default: postgres } = await import("postgres") as any;
    const sql = postgres(dbUrl, { max: 1 });

    await page.goto("/admin/client-config");
    await page.waitForLoadState("networkidle");

    const seededRow = page.locator(
      `table.config-table tr:has(button[data-edit-row="${primaryAccountId}"])`,
    );
    await expect(seededRow).toBeVisible();
    await seededRow.locator("button.config-edit-btn").click();

    const wizard = page.locator("section.config-edit-wizard");
    await expect(wizard).toBeVisible();

    // Change a mutable field so the staged UPDATE is meaningful
    await wizard.getByTestId("ist-field-longName").fill("E2E EDIT FK TEST ROW");
    // Requester + rationale (min 10 chars)
    await wizard.getByLabel("Aanvrager").fill("E2E Admin");
    await wizard
      .locator("textarea[name=\"rationale\"]")
      .fill("FK regression test — update via governed change request.");

    // Submit: the action stages the change and redirects to the dashboard
    await wizard.getByTestId("submit-change-request").click();
    await page.waitForURL(/\/changes$/);
    await page.waitForLoadState("networkidle");

    // The change request row must carry the REAL clients.id of the seeded
    // row's client code (lookup by external_reference prefix), and the
    // clients join must resolve to an actual client name.
    const clientId = await sql`
      SELECT cr.client_id, c.name AS client_name
      FROM change_requests cr
      JOIN clients c ON c.id = cr.client_id
      WHERE cr.rationale = 'FK regression test — update via governed change request.'
      ORDER BY cr.created_at DESC
      LIMIT 1`;
    expect(clientId.length).toBe(1);
    expect(clientId[0].client_name).toBeTruthy();

    // And the staged change_portfolio_configuration row exists for it
    const staged = await sql`
      SELECT 1 AS ok
      FROM client_config.change_portfolio_configuration cpc
      JOIN change_requests cr ON cr.id = cpc.change_request_id
      WHERE cr.rationale = 'FK regression test — update via governed change request.'
      LIMIT 1`;
    expect(staged.length).toBe(1);

    await sql.end();
  });
});
