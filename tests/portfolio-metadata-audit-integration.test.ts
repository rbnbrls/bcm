/**
 * Integration tests for audit coverage + backward compatibility of portfolio
 * and parent-account metadata handling (t_9b9c3aaf).
 *
 * Acceptance criteria pinned here:
 *  - Audit logs capture ALL metadata mutations:
 *      * governed flow (change request): audit_log 'requested' entry,
 *        status_history transition, staged change_portfolio_metadata_request
 *        rows flipped to 'applied' (apply lineage, lifecycle spec §6.6);
 *      * admin bypass (direct CRUD): every mutation writes a
 *        client_config.admin_audit_log row (spec §9.2 — recorded
 *        out-of-band), including before/after for parent_account updates.
 *  - No regression in existing configuration behavior: applying new metadata
 *    changes leaves every pre-existing active configuration row untouched
 *    (snapshot compare of portfolio / parent_account /
 *    portfolio_configuration / account before and after).
 *
 * These tests are skipped when DATABASE_URL is not set. They run in CI inside
 * the e2e-db-test job (see .github/workflows/ci.yml), which applies
 * db/init.sql, runs the runtime migrations, seeds reference data, and then
 * executes the DB-backed tests. They can also be run locally:
 *
 *   DATABASE_URL=postgres://bcm:***@localhost:5432/bcm \
 *     npx vitest run tests/portfolio-metadata-audit-integration.test.ts
 */
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { sql } from "@/lib/db";
import {
  stagePortfolioMetadataChange,
  getChangePortfolioMetadataRequests,
  createClientConfigPortfolio,
  retireClientConfigPortfolio,
  hardDeleteClientConfigPortfolio,
  createClientConfigParentAccount,
  updateClientConfigParentAccount,
  retireClientConfigParentAccount,
  hardDeleteClientConfigParentAccount,
} from "@/lib/client-config-db";
import { saveChangeRequest, updateChangeStatus } from "@/lib/db";
import { processChangeForProcessedStatus } from "@/lib/change-processor";

const dbUrl = process.env.DATABASE_URL;

const REFERENCE_PREFIX = "AUDIT-META";
const CLIENTS = ["AM1", "AM2"] as const;
const BASELINE_PA = "AM_MAIN";
const BASELINE_PF = "AM1PF";
const RETIRE_PF = "AM2PF"; // portfolio with no children — safe to retire
const CREATE_PF = "AM3PF";
const CREATE_PA = "AM_NEW";
const ADMIN_PF = "AMAPF";
const ADMIN_PF_RETIRE = "AMART";
const ADMIN_PA = "AMA_HOOFD";
const ADMIN_PA_UPDATE = "AMA_HOOFD2";
const ADMIN_PA_RETIRE = "AMA_HOOFD3";
const ADMIN_PA_DELETE = "AMA_HOOFD4";
const EFFECTIVE_FROM = "2026-01-01";
const ACTOR = "integration-test-admin";

const changeRequestIds: string[] = [];
const createdCodes = {
  portfolio: new Set<string>(),
  parentAccount: new Set<string>(),
};

let clientId: string | null = null;
let changeTypeId: string | null = null;

// ── Snapshot helpers ──────────────────────────────────────────────────────
// Capture every existing client_config row (keyed by identity) so tests can
// assert that pre-existing active configurations are untouched.

type Snapshot = {
  portfolio: Map<string, { parent_account_id: number | null; active_ind: boolean }>;
  parentAccount: Map<string, { msa_parent_account_code: string | null; active_ind: boolean }>;
  portfolioConfiguration: Map<
    string,
    {
      client_code: string;
      portfolio_code: string;
      asset_class_code: string;
      sub_asset_class_code: string;
      manager_code: string;
      benchmark_code: string;
      npc_classification_id: number;
      active_ind: boolean;
      effective_from: string | null;
      effective_until: string | null;
    }
  >;
  account: Map<string, { client_code: string; portfolio_id: number }>;
};

async function snapshotClientConfig(): Promise<Snapshot> {
  const [portfolios, parentAccounts, configs, accounts] = await Promise.all([
    sql`SELECT portfolio_code, parent_account_id, active_ind FROM client_config.portfolio`,
    sql`SELECT parent_account_code, msa_parent_account_code, active_ind FROM client_config.parent_account`,
    sql`SELECT primary_account_id, client_code, portfolio_code, asset_class_code, sub_asset_class_code, manager_code, benchmark_code, npc_classification_id, active_ind, effective_from, effective_until FROM client_config.portfolio_configuration`,
    sql`SELECT primary_account_id, client_code, portfolio_id FROM client_config.account`,
  ]);
  return {
    portfolio: new Map(
      portfolios.map((r: any) => [
        String(r.portfolio_code),
        {
          parent_account_id: r.parent_account_id != null ? Number(r.parent_account_id) : null,
          active_ind: Boolean(r.active_ind),
        },
      ]),
    ),
    parentAccount: new Map(
      parentAccounts.map((r: any) => [
        String(r.parent_account_code),
        {
          msa_parent_account_code: r.msa_parent_account_code != null ? String(r.msa_parent_account_code) : null,
          active_ind: Boolean(r.active_ind),
        },
      ]),
    ),
    portfolioConfiguration: new Map(
      configs.map((r: any) => [
        String(r.primary_account_id),
        {
          client_code: String(r.client_code),
          portfolio_code: String(r.portfolio_code),
          asset_class_code: String(r.asset_class_code).trim(),
          sub_asset_class_code: String(r.sub_asset_class_code).trim(),
          manager_code: String(r.manager_code).trim(),
          benchmark_code: String(r.benchmark_code),
          npc_classification_id: Number(r.npc_classification_id),
          active_ind: Boolean(r.active_ind),
          effective_from: r.effective_from ? String(r.effective_from) : null,
          effective_until: r.effective_until ? String(r.effective_until) : null,
        },
      ]),
    ),
    account: new Map(
      accounts.map((r: any) => [
        String(r.primary_account_id),
        { client_code: String(r.client_code), portfolio_id: Number(r.portfolio_id) },
      ]),
    ),
  };
}

/** Assert that every row present before is still present and unchanged. */
function expectBaselineUnchanged(before: Snapshot, after: Snapshot): void {
  expect(after.portfolio.size).toBeGreaterThanOrEqual(before.portfolio.size);
  expect(after.parentAccount.size).toBeGreaterThanOrEqual(before.parentAccount.size);
  expect(after.portfolioConfiguration.size).toBe(before.portfolioConfiguration.size);
  expect(after.account.size).toBe(before.account.size);

  for (const [code, row] of before.portfolio) {
    expect(after.portfolio.get(code)).toEqual(row);
  }
  for (const [code, row] of before.parentAccount) {
    expect(after.parentAccount.get(code)).toEqual(row);
  }
  for (const [id, row] of before.portfolioConfiguration) {
    expect(after.portfolioConfiguration.get(id)).toEqual(row);
  }
  for (const [id, row] of before.account) {
    expect(after.account.get(id)).toEqual(row);
  }
}

// ── Lookups run at module load (top-level await) because describe.skipIf is
// ── evaluated during collection, before any beforeAll hook would have run.
if (dbUrl) {
  await sql!`SET app.change_process_bypass = 'true'`;

  // Pre-clean leftovers from a previously crashed run. Change requests first —
  // staged rows cascade away with them; portfolio_configuration rows (FK to
  // portfolio.portfolio_code) before the portfolios they reference.
  await sql!`DELETE FROM change_requests WHERE reference LIKE ${`${REFERENCE_PREFIX}-%`}`;
  for (const code of CLIENTS) {
    await sql!`DELETE FROM client_config.portfolio_configuration WHERE client_code = ${code}`;
    await sql!`DELETE FROM client_config.client WHERE client_code = ${code}`;
  }
  for (const code of [...createdCodes.portfolio]) {
    await sql!`DELETE FROM client_config.portfolio WHERE portfolio_code = ${code}`;
  }
  for (const code of [...createdCodes.parentAccount]) {
    await sql!`DELETE FROM client_config.parent_account WHERE parent_account_code = ${code}`;
  }
  for (const code of [BASELINE_PF, RETIRE_PF, "AMXPF", ADMIN_PF, ADMIN_PF_RETIRE]) {
    await sql!`DELETE FROM client_config.portfolio WHERE portfolio_code = ${code}`;
  }
  for (const code of [BASELINE_PA, CREATE_PA, ADMIN_PA, ADMIN_PA_UPDATE, ADMIN_PA_RETIRE, ADMIN_PA_DELETE]) {
    await sql!`DELETE FROM client_config.parent_account WHERE parent_account_code = ${code}`;
  }

  const [client] = await sql!`SELECT id FROM clients ORDER BY created_at LIMIT 1`;
  clientId = client ? String(client.id) : null;
  const [changeType] = await sql!`
    SELECT id FROM change_type_config WHERE slug = 'portfolio_configuration_create' LIMIT 1
  `;
  changeTypeId = changeType ? String(changeType.id) : null;

  // Seed the "existing active configuration" baseline: one parent account, one
  // portfolio, two live configuration rows — all of which must survive the
  // metadata changes applied by the tests below.
  await sql!`
    INSERT INTO client_config.client (client_code, client_name)
    VALUES ('AM1', 'Audit Metadata Test Pensioenfonds')
  `;
  const [pa] = await sql!`
    INSERT INTO client_config.parent_account (parent_account_code)
    VALUES (${BASELINE_PA})
    RETURNING parent_account_id
  `;
  createdCodes.parentAccount.add(BASELINE_PA);
  await sql!`
    INSERT INTO client_config.portfolio (portfolio_code, parent_account_id)
    VALUES (${BASELINE_PF}, ${pa.parent_account_id})
  `;
  createdCodes.portfolio.add(BASELINE_PF);
  await sql!`
    INSERT INTO client_config.portfolio_configuration (
      primary_account_id, client_code, portfolio_code, asset_class_code,
      sub_asset_class_code, manager_code, benchmark_code, npc_classification_id,
      long_name, short_name, active_ind, effective_from, effective_until
    ) VALUES (
      'AM1*FIHYG*ROB', 'AM1', ${BASELINE_PF}, 'FI', 'HYG', 'ROB',
      'MSCI-WORLD-NR', 1, 'AM1 Audit Baseline FI HYG', 'AM1-BL',
      true, ${EFFECTIVE_FROM}, NULL
    )
  `;
  await sql!`
    INSERT INTO client_config.portfolio_configuration (
      primary_account_id, client_code, portfolio_code, asset_class_code,
      sub_asset_class_code, manager_code, benchmark_code, npc_classification_id,
      long_name, short_name, active_ind, effective_from, effective_until
    ) VALUES (
      'AM1*EQACX*EIG', 'AM1', ${BASELINE_PF}, 'EQ', 'ACX', 'EIG',
      'MSCI-WORLD-NR', 2, 'AM1 Audit Baseline EQ ACX', 'AM1-EQ',
      true, ${EFFECTIVE_FROM}, NULL
    )
  `;
}

async function createChangeRequest(): Promise<string> {
  const id = randomUUID();
  await saveChangeRequest({
    id,
    reference: `${REFERENCE_PREFIX}-${id.slice(0, 8)}`,
    changeType: "portfolio_configuration_create",
    changeTypeId: changeTypeId!,
    clientId: clientId!,
    requestedBy: ACTOR,
    rationale: "portfolio metadata audit integration test",
    effectiveDate: "2026-12-01",
    items: [],
  });
  changeRequestIds.push(id);
  return id;
}

afterAll(async () => {
  if (!dbUrl) return;
  await sql!`SET app.change_process_bypass = 'true'`;
  await sql!`DELETE FROM change_requests WHERE reference LIKE ${`${REFERENCE_PREFIX}-%`}`;
  for (const id of changeRequestIds) {
    await sql!`DELETE FROM change_requests WHERE id = ${id}`;
  }
  // portfolio_configuration rows (FK to portfolio.portfolio_code) must go
  // before the portfolios they reference.
  for (const code of CLIENTS) {
    await sql!`DELETE FROM client_config.portfolio_configuration WHERE client_code = ${code}`;
    await sql!`DELETE FROM client_config.client WHERE client_code = ${code}`;
  }
  for (const code of createdCodes.portfolio) {
    await sql!`DELETE FROM client_config.portfolio WHERE portfolio_code = ${code}`;
  }
  for (const code of createdCodes.parentAccount) {
    await sql!`DELETE FROM client_config.parent_account WHERE parent_account_code = ${code}`;
  }
  // Admin audit rows created by the admin-bypass tests (no FK to clean via).
  await sql!`
    DELETE FROM client_config.admin_audit_log
    WHERE code IN (
      ${ADMIN_PF}, ${ADMIN_PF_RETIRE}, ${ADMIN_PA}, ${ADMIN_PA_UPDATE},
      ${ADMIN_PA_RETIRE}, ${ADMIN_PA_DELETE}
    )
  `;
});

describe.skipIf(!dbUrl)("portfolio metadata audit — real database", () => {
  describe.skipIf(!clientId || !changeTypeId)("requires a seeded client", () => {
    it("governed flow: CREATE/RETIRE apply leaves existing active configurations unchanged and is fully audited", async () => {
      const before = await snapshotClientConfig();

      // 1. Stage a RETIRE for a childless portfolio, a CREATE for a new
      //    portfolio (referencing the baseline parent account) and a CREATE
      //    for a new parent account — all in one change request.
      const changeRequestId = await createChangeRequest();

      // Seed the portfolio that will be retired (childless, so RETIRE passes).
      await sql!`
        INSERT INTO client_config.client (client_code, client_name)
        VALUES ('AM2', 'Audit Metadata Retire Pensioenfonds')
      `;
      await sql!`
        INSERT INTO client_config.portfolio (portfolio_code, parent_account_id)
        VALUES (${RETIRE_PF}, NULL)
      `;
      createdCodes.portfolio.add(RETIRE_PF);

      const retire = await stagePortfolioMetadataChange({
        changeRequestId,
        dimension: "portfolio",
        actionType: "RETIRE",
        code: RETIRE_PF,
      });
      expect(retire.ok).toBe(true);
      const createPf = await stagePortfolioMetadataChange({
        changeRequestId,
        dimension: "portfolio",
        actionType: "CREATE",
        code: CREATE_PF,
        parentAccountCode: BASELINE_PA,
      });
      expect(createPf.ok).toBe(true);
      const createPa = await stagePortfolioMetadataChange({
        changeRequestId,
        dimension: "parent_account",
        actionType: "CREATE",
        code: CREATE_PA,
        msaParentAccountCode: "MSA_AM_NEW",
      });
      expect(createPa.ok).toBe(true);

      // 2. Process the change request through the real app path
      //    (updateChangeStatus → processChangeForProcessedStatus → apply).
      await updateChangeStatus(changeRequestId, "processed", ACTOR);

      // 3. Apply lineage: staged rows flipped to 'applied'.
      const staged = await getChangePortfolioMetadataRequests(changeRequestId);
      expect(staged).toHaveLength(3);
      for (const row of staged) {
        expect(row.applyStatus).toBe("applied");
        expect(row.applyError).toBeNull();
      }

      // 4. New rows exist and are active; the retired portfolio is soft-deleted.
      const [newPortfolio] = await sql!`
        SELECT portfolio_code, active_ind FROM client_config.portfolio
        WHERE portfolio_code = ${CREATE_PF}
      `;
      expect(newPortfolio).toBeTruthy();
      expect(Boolean(newPortfolio.active_ind)).toBe(true);
      const [retiredPortfolio] = await sql!`
        SELECT portfolio_code, active_ind FROM client_config.portfolio
        WHERE portfolio_code = ${RETIRE_PF}
      `;
      expect(Boolean(retiredPortfolio.active_ind)).toBe(false);
      const [newParentAccount] = await sql!`
        SELECT parent_account_code, active_ind FROM client_config.parent_account
        WHERE parent_account_code = ${CREATE_PA}
      `;
      expect(newParentAccount).toBeTruthy();
      expect(Boolean(newParentAccount.active_ind)).toBe(true);
      createdCodes.portfolio.add(CREATE_PF);
      createdCodes.parentAccount.add(CREATE_PA);

      // 5. Backward compatibility: every pre-existing active configuration
      //    row is byte-for-byte unchanged.
      const after = await snapshotClientConfig();
      expectBaselineUnchanged(before, after);

      // 6. Audit trail: audit_log 'requested' entry + status_history
      //    transition for the processed change request.
      const [auditEntry] = await sql!`
        SELECT action, actor, new_status FROM audit_log
        WHERE change_request_id = ${changeRequestId}
      `;
      expect(auditEntry).toBeTruthy();
      expect(String(auditEntry.action)).toBe("requested");
      expect(String(auditEntry.actor)).toBe(ACTOR);
      const [history] = await sql!`
        SELECT to_status FROM status_history
        WHERE change_request_id = ${changeRequestId}
      `;
      expect(history).toBeTruthy();
      expect(String(history.to_status)).toBe("processed");
    });

    it("governed flow: processChangeForProcessedStatus routes metadata changes to the 3NF apply path", async () => {
      const changeRequestId = await createChangeRequest();
      await sql!`
        INSERT INTO client_config.portfolio (portfolio_code, parent_account_id)
        VALUES ('AMXPF', NULL)
      `;
      createdCodes.portfolio.add("AMXPF");
      const staged = await stagePortfolioMetadataChange({
        changeRequestId,
        dimension: "portfolio",
        actionType: "RETIRE",
        code: "AMXPF",
      });
      expect(staged.ok).toBe(true);

      const result = await processChangeForProcessedStatus(
        changeRequestId,
        "portfolio_configuration_create",
      );
      expect(result.usedLegacy).toBe(false);
      expect(result.applied).toBe(true);
      expect(result.outcomes).toHaveLength(1);
      expect(result.outcomes[0]).toMatchObject({
        actionType: "RETIRE",
        primaryAccountId: "AMXPF",
        result: "applied",
      });
    });

    it("admin bypass: every mutation is recorded in client_config.admin_audit_log and leaves existing configurations unchanged", async () => {
      const before = await snapshotClientConfig();

      // create portfolio
      await createClientConfigPortfolio({ portfolioCode: ADMIN_PF, actor: ACTOR });
      createdCodes.portfolio.add(ADMIN_PF);
      // retire portfolio (childless)
      await createClientConfigPortfolio({ portfolioCode: ADMIN_PF_RETIRE, actor: ACTOR });
      createdCodes.portfolio.add(ADMIN_PF_RETIRE);
      await retireClientConfigPortfolio(ADMIN_PF_RETIRE, ACTOR);
      // create parent account
      await createClientConfigParentAccount({ parentAccountCode: ADMIN_PA, actor: ACTOR });
      createdCodes.parentAccount.add(ADMIN_PA);
      // update parent account (code change — identity change, must be audited
      // with before/after per spec §9.2)
      const [adminPaRow] = await sql!`
        SELECT parent_account_id FROM client_config.parent_account
        WHERE parent_account_code = ${ADMIN_PA}
      `;
      await updateClientConfigParentAccount(
        Number(adminPaRow.parent_account_id),
        { parentAccountCode: ADMIN_PA_UPDATE, msaParentAccountCode: "MSA_UPD" },
        ACTOR,
      );
      createdCodes.parentAccount.add(ADMIN_PA_UPDATE);
      // retire parent account (no active portfolios reference it)
      await createClientConfigParentAccount({ parentAccountCode: ADMIN_PA_RETIRE, actor: ACTOR });
      createdCodes.parentAccount.add(ADMIN_PA_RETIRE);
      await retireClientConfigParentAccount(ADMIN_PA_RETIRE, ACTOR);
      // hard delete parent account
      await createClientConfigParentAccount({ parentAccountCode: ADMIN_PA_DELETE, actor: ACTOR });
      createdCodes.parentAccount.add(ADMIN_PA_DELETE);
      const deleted = await hardDeleteClientConfigParentAccount(ADMIN_PA_DELETE, ACTOR);
      expect(deleted).toBe(true);
      // hard delete portfolio (childless, unreferenced)
      const deletedPf = await hardDeleteClientConfigPortfolio(ADMIN_PF_RETIRE, ACTOR);
      expect(deletedPf).toBe(true);

      // Audit log captures every mutation with the right action/dimension/actor.
      const auditRows = await sql!`
        SELECT action, dimension, code, actor, details
        FROM client_config.admin_audit_log
        WHERE code IN (${ADMIN_PF}, ${ADMIN_PF_RETIRE}, ${ADMIN_PA}, ${ADMIN_PA_UPDATE}, ${ADMIN_PA_RETIRE}, ${ADMIN_PA_DELETE})
        ORDER BY id ASC
      `;
      const actions = auditRows.map((r: any) => String(r.action));
      expect(actions).toContain("create_portfolio");
      expect(actions).toContain("retire_portfolio");
      expect(actions).toContain("hard_delete_portfolio");
      expect(actions).toContain("create_parent_account");
      expect(actions).toContain("update_parent_account");
      expect(actions).toContain("retire_parent_account");
      expect(actions).toContain("hard_delete_parent_account");
      for (const row of auditRows) {
        expect(String(row.actor)).toBe(ACTOR);
      }
      const updateRow = auditRows.find((r: any) => String(r.action) === "update_parent_account");
      expect(updateRow).toBeTruthy();
      const rawDetails = updateRow.details as unknown;
      const details =
        typeof rawDetails === "string" ? JSON.parse(rawDetails) : (rawDetails as Record<string, any>);
      expect(String(details.before.parent_account_code)).toBe(ADMIN_PA);
      expect(String(details.after.parent_account_code)).toBe(ADMIN_PA_UPDATE);
      expect(String(details.after.msa_parent_account_code)).toBe("MSA_UPD");

      // Backward compatibility: pre-existing active configurations unchanged.
      const after = await snapshotClientConfig();
      expectBaselineUnchanged(before, after);
    });

    it("admin bypass: a blocked mutation (retire with active configs) writes NO audit entry", async () => {
      // BASELINE_PF has two active portfolio_configuration rows — RETIRE must
      // be rejected by the shared pre-condition and must not leave an audit row.
      await expect(
        retireClientConfigPortfolio(BASELINE_PF, ACTOR),
      ).rejects.toThrow(/actieve portfolio configuraties/);

      const [auditRows] = await sql!`
        SELECT count(*)::int AS n FROM client_config.admin_audit_log
        WHERE action = 'retire_portfolio' AND code = ${BASELINE_PF}
      `;
      expect(auditRows.n).toBe(0);

      // The baseline row is still active.
      const [row] = await sql!`
        SELECT active_ind FROM client_config.portfolio
        WHERE portfolio_code = ${BASELINE_PF}
      `;
      expect(Boolean(row.active_ind)).toBe(true);
    });
  });
});
