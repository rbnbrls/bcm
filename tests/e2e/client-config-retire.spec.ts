import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { setAdminRole } from "./helpers";

/**
 * E2E coverage for the retire (Beëindigen) flow on /admin/client-config
 * (kanban task t_cedf6a27).
 *
 * Acceptance flow exercised here:
 *   1. navigate to /admin/client-config
 *   2. click retire ("Beëindigen") on an ACTIVE row
 *   3. fill in rationale + effective retirement date in the modal
 *   4. submit — a governed DELETE change request (portfolio_configuration_retire)
 *      is staged and the operator is redirected to /changes
 *   5. the change request is processed (status workflow submitted → accepted →
 *      in_progress → processed, the last transition invoking the change
 *      processor)
 *   6. the row DISAPPEARS from the active table on /admin/client-config, is
 *      marked inactive in the database (active_ind=false, effective_until =
 *      the requested retirement date) and is preserved in history.
 *
 * Requires a seeded database (db:migrate + db:seed),
 * so the spec is tagged @db and runs in the dedicated e2e-db-test CI job.
 */
test.describe("Client config retire flow", { tag: "@db" }, () => {
  const SEED_SCRIPT = join(__dirname, "seed-client-config-retire-e2e.mjs");

  /** primaryAccountId of the seeded test row, set by beforeEach. */
  let primaryAccountId = "";

  /** Unique rationale so DB assertions never match another test's request. */
  function uniqueRationale(): string {
    return `Retire E2E acceptance ${Date.now()} — governed DELETE flow.`;
  }

  /** Retirement date 30 days out: valid (>= today, >= effective_from). */
  const retireDate = new Date(Date.now() + 30 * 86400000)
    .toISOString()
    .split("T")[0];
  /** A date in the past — must be rejected by the modal's native validation. */
  const pastDate = new Date(Date.now() - 30 * 86400000)
    .toISOString()
    .split("T")[0];

  /**
   * Normalize a postgres.js `date` value (a JS Date at local midnight) to an
   * ISO yyyy-mm-dd string using LOCAL calendar components, so the assertion
   * is timezone-safe (CI runs UTC, local dev may run CEST).
   */
  function toDateString(value: unknown): string {
    const d = value instanceof Date ? value : new Date(String(value));
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }

  /** Re-seed the single active test row and store its primaryAccountId. */
  function reseedTestRow(): void {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error(
        "DATABASE_URL is required for the client-config retire e2e tests. " +
          "Set it and seed the database first: npm run db:migrate && npm run db:seed",
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

  test.beforeEach(async ({ page }) => {
    // /admin/* is gated by the bcm_active_role RBAC cookie (proxy.ts).
    await setAdminRole(page);
  });

  test("retire flow: submit stages a DELETE change request and processing removes the row from the active table", async ({
    page,
    request,
  }) => {
    const dbUrl = process.env.DATABASE_URL!;
    const { default: postgres } = (await import("postgres")) as any;
    const sql = postgres(dbUrl, { max: 1 });
    const rationale = uniqueRationale();

    // ── 1. Navigate to the admin client-config table ──────────────────────
    await page.goto("/admin/client-config");
    await page.waitForLoadState("networkidle");

    const table = page.locator("table.config-table");
    await expect(table).toBeVisible();

    // ── 2. Click retire on the seeded ACTIVE row ───────────────────────────
    const seededRow = table.locator(
      `tr:has(button[aria-label="Beëindig portfolio configuratie ${primaryAccountId}"])`,
    );
    await expect(seededRow).toBeVisible();
    const retireBtn = seededRow.locator("button.config-row-retire");
    await expect(retireBtn).toBeEnabled();
    await retireBtn.click();

    // The modal opens carrying the row identity.
    const modal = page.locator(".retire-modal");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText(primaryAccountId);

    // ── 3. Fill in rationale + effective retirement date ───────────────────
    await modal.locator("textarea[name='rationale']").fill(rationale);
    await modal.locator("input[name='effectiveDate']").fill(retireDate);

    // ── 4. Submit: stages the governed DELETE change request and redirects ─
    await modal
      .getByRole("button", { name: "Beëindig via change verzoek" })
      .click();
    await page.waitForURL(/\/changes\/?(\?.*)?$/);
    await page.waitForLoadState("networkidle");

    // ── 5. A pending change request was staged with the retire shape ───────
    const [cr] = await sql`
      SELECT id, status, change_type, effective_date
      FROM change_requests
      WHERE rationale = ${rationale}
      ORDER BY created_at DESC
      LIMIT 1`;
    expect(cr, "expected a staged change request for the retire rationale").toBeTruthy();
    expect(cr.status).toBe("submitted");
    expect(cr.change_type).toBe("portfolio_configuration_retire");
    expect(toDateString(cr.effective_date)).toBe(retireDate);

    const [staged] = await sql`
      SELECT action_type, target_primary_account_id, effective_from, effective_until
      FROM client_config.change_portfolio_configuration
      WHERE change_request_id = ${cr.id}`;
    expect(staged, "expected a staged change_portfolio_configuration row").toBeTruthy();
    expect(staged.action_type).toBe("DELETE");
    expect(staged.target_primary_account_id).toBe(primaryAccountId);
    // The requested retirement date is staged as the close-out date.
    expect(toDateString(staged.effective_until)).toBe(retireDate);

    // The live row is still active BEFORE processing (staging never mutates it).
    const [before] = await sql`
      SELECT active_ind
      FROM client_config.portfolio_configuration
      WHERE primary_account_id = ${primaryAccountId}`;
    expect(before.active_ind).toBe(true);

    // ── 6. Process the change request (workflow walk via the status API) ──
    // The 'accepted' transition is gated by the changes:approve permission,
    // which only the account_manager role carries (lib/rbac.ts). The standalone
    // `request` fixture shares no browser cookies, so the bcm_active_role
    // cookie must be sent explicitly — the page context keeps the admin role
    // for the /admin/* assertions.
    for (const status of ["accepted", "in_progress", "processed"]) {
      const res = await request.post(`/api/changes/${cr.id}/status`, {
        data: { status, userName: "E2E Admin" },
        headers: { cookie: "bcm_active_role=account_manager" },
      });
      expect(
        res.ok(),
        `expected status transition to '${status}' to succeed: ${await res.text()}`,
      ).toBeTruthy();
    }

    // ── 7. The row disappears from the ACTIVE table after processing ───────
    await page.goto("/admin/client-config");
    await page.waitForLoadState("networkidle");
    await expect(
      table.locator(
        `tr:has(button[aria-label="Beëindig portfolio configuratie ${primaryAccountId}"])`,
      ),
    ).toHaveCount(0);

    // ── 8. Database: inactive, closed out at the requested date, history kept ─
    const [row] = await sql`
      SELECT active_ind, effective_until
      FROM client_config.portfolio_configuration
      WHERE primary_account_id = ${primaryAccountId}`;
    expect(row.active_ind).toBe(false);
    expect(toDateString(row.effective_until)).toBe(retireDate);

    const [count] = await sql`
      SELECT count(*)::int AS n
      FROM client_config.portfolio_configuration
      WHERE primary_account_id = ${primaryAccountId}`;
    expect(count.n).toBe(1);

    await sql.end();
  });

  test("retire modal blocks a past effective date: no change request is staged", async ({
    page,
  }) => {
    const dbUrl = process.env.DATABASE_URL!;
    const { default: postgres } = (await import("postgres")) as any;
    const sql = postgres(dbUrl, { max: 1 });
    const rationale = uniqueRationale();

    await page.goto("/admin/client-config");
    await page.waitForLoadState("networkidle");

    const seededRow = page.locator(
      `tr:has(button[aria-label="Beëindig portfolio configuratie ${primaryAccountId}"])`,
    );
    await expect(seededRow).toBeVisible();
    await seededRow.locator("button.config-row-retire").click();

    const modal = page.locator(".retire-modal");
    await expect(modal).toBeVisible();

    // Valid rationale but a PAST retirement date — the native date input
    // min=today validation must block submission.
    await modal.locator("textarea[name='rationale']").fill(rationale);
    await modal.locator("input[name='effectiveDate']").fill(pastDate);
    await modal
      .getByRole("button", { name: "Beëindig via change verzoek" })
      .click();

    // No navigation, no staged request: the operator stays on the admin page
    // with the modal open (invalid submit is prevented client-side).
    await expect(page).toHaveURL(/\/admin\/client-config$/);
    await expect(modal).toBeVisible();

    const staged = await sql`
      SELECT 1 AS ok
      FROM change_requests
      WHERE rationale = ${rationale}
      LIMIT 1`;
    expect(staged.length).toBe(0);

    // The row is still in the active table.
    await expect(seededRow).toBeVisible();
    await sql.end();
  });
});
