/**
 * Integration tests for the retire (DELETE) processing step against a REAL
 * PostgreSQL database (t_a6d732ef).
 *
 * These tests are skipped when DATABASE_URL is not set. They run in CI inside
 * the e2e-db-test job (see .github/workflows/ci.yml), which applies
 * db/init.sql, runs the runtime migrations, seeds reference data, and then
 * executes the DB-backed tests. They can also be run locally:
 *
 *   DATABASE_URL=postgres://bcm:***@localhost:5432/bcm \
 *     npx vitest run tests/retire-apply-integration.test.ts
 *
 * Acceptance pinned here (CR-PC-03 — processing a staged DELETE change
 * request):
 *  - the live portfolio_configuration row gets active_ind = false and
 *    effective_until = the requested retirement date
 *  - the row is no longer returned by the active config view
 *    (getClientConfigPortfolioConfigurations) but is preserved in history
 *  - the staged change_portfolio_configuration row flips to 'applied'
 *  - processChangeForProcessedStatus routes the retire change to the 3NF
 *    apply path (usedLegacy = false)
 *
 * The unit-test counterparts live in
 * tests/change-portfolio-config-workflow.test.ts (apply date derivation +
 * processor routing) and tests/actions/client-config-retire-staging.test.ts
 * (staging shape).
 */
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { sql } from "@/lib/db";
import {
  stageChangePortfolioConfiguration,
  getClientConfigPortfolioConfigurations,
} from "@/lib/client-config-db";
import { processChangeForProcessedStatus } from "@/lib/change-processor";

const dbUrl = process.env.DATABASE_URL;

const CLIENTS = ["RT1", "RT2", "RT3"] as const;
const PORTFOLIOS = ["RT1PF", "RT2PF", "RT3PF"] as const;
const PARENT_ACCOUNTS = ["RT1_MAIN", "RT2_MAIN", "RT3_MAIN"] as const;
const REFERENCE_PREFIX = "RETIRE-APPLY-TEST";
const LIVE_EFFECTIVE_FROM = "2026-01-01";
const RETIRE_DATE = "2026-12-01"; // requested retirement date (>= effective_from)

let clientId: string | null = null;
let retireChangeTypeId: string | null = null;
const changeRequestIds: string[] = [];

// Lookups run at module load (top-level await) because describe.skipIf is
// evaluated during collection, before any beforeAll hook would have run.
if (dbUrl) {
  // The change-process enforcement triggers (db/enforce_change_process.sql)
  // block direct DML on portfolio_configuration unless the session GUC is
  // set. Cleanup/setup below runs outside the apply transaction, so set the
  // governed-path GUC for this session (harmless when no trigger exists).
  await sql!`SET app.change_process_bypass = 'true'`;

  // Pre-clean leftovers from a previously crashed run. Delete the change
  // requests FIRST — their staged change_portfolio_configuration rows cascade
  // away, unblocking the portfolio/portfolio_configuration deletes below.
  await sql!`DELETE FROM change_requests WHERE reference LIKE ${`${REFERENCE_PREFIX}-%`}`;
  for (const code of CLIENTS) {
    await sql!`DELETE FROM client_config.portfolio_configuration WHERE client_code = ${code}`;
  }
  for (const code of PORTFOLIOS) {
    await sql!`DELETE FROM client_config.portfolio WHERE portfolio_code = ${code}`;
  }
  for (const code of PARENT_ACCOUNTS) {
    await sql!`DELETE FROM client_config.parent_account WHERE parent_account_code = ${code}`;
  }
  for (const code of CLIENTS) {
    await sql!`DELETE FROM client_config.client WHERE client_code = ${code}`;
  }

  const [client] = await sql!`SELECT id FROM clients ORDER BY created_at LIMIT 1`;
  const [changeType] = await sql!`
    SELECT id FROM change_type_config WHERE slug = 'portfolio_configuration_retire' LIMIT 1
  `;
  clientId = client ? String(client.id) : null;
  retireChangeTypeId = changeType ? String(changeType.id) : null;
}

/** Create a dedicated client + parent account + portfolio + active live row. */
async function createLiveRow(
  clientCode: string,
  portfolioCode: string,
  parentAccountCode: string,
): Promise<string> {
  await sql!`
    INSERT INTO client_config.client (client_code, client_name)
    VALUES (${clientCode}, ${`${clientCode} Retire Test Pensioenfonds`})
  `;
  const [pa] = await sql!`
    INSERT INTO client_config.parent_account (parent_account_code)
    VALUES (${parentAccountCode})
    RETURNING parent_account_id
  `;
  await sql!`
    INSERT INTO client_config.portfolio (portfolio_code, parent_account_id)
    VALUES (${portfolioCode}, ${pa.parent_account_id})
  `;
  const primaryAccountId = `${clientCode}*FIHYG*ROB`;
  await sql!`
    INSERT INTO client_config.portfolio_configuration (
      primary_account_id, client_code, portfolio_code, asset_class_code,
      sub_asset_class_code, manager_code, benchmark_code, npc_classification_id,
      long_name, short_name, active_ind, effective_from, effective_until
    ) VALUES (
      ${primaryAccountId}, ${clientCode}, ${portfolioCode}, 'FI', 'HYG', 'ROB',
      'MSCI-WORLD-NR', 1, ${`${clientCode} Retire Test FI HYG`}, ${`${clientCode}-RT`},
      true, ${LIVE_EFFECTIVE_FROM}, NULL
    )
  `;
  return primaryAccountId;
}

async function createChangeRequest(): Promise<string> {
  const id = randomUUID();
  await sql!`
    INSERT INTO change_requests (
      id, reference, change_type, change_type_id, client_id,
      requested_by, rationale, effective_date, status
    ) VALUES (
      ${id}, ${`${REFERENCE_PREFIX}-${id.slice(0, 8)}`}, 'portfolio_configuration_retire',
      ${retireChangeTypeId}, ${clientId}, 'integration-test', 'retire apply integration test',
      ${RETIRE_DATE}, 'processed'
    )
  `;
  changeRequestIds.push(id);
  return id;
}

function stageDelete(input: {
  changeRequestId: string;
  primaryAccountId: string;
  effectiveUntil: string | null;
}) {
  return stageChangePortfolioConfiguration({
    changeRequestId: input.changeRequestId,
    actionType: "DELETE",
    primaryAccountId: input.primaryAccountId,
    targetPrimaryAccountId: input.primaryAccountId,
    clientCode: input.primaryAccountId.split("*")[0],
    portfolioCode: `${input.primaryAccountId.split("*")[0]}PF`,
    assetClassCode: "FI",
    subAssetClassCode: "HYG",
    managerCode: "ROB",
    benchmarkCode: "MSCI-WORLD-NR",
    npcClassificationId: 1,
    longName: `${input.primaryAccountId.split("*")[0]} Retire Test FI HYG`,
    shortName: `${input.primaryAccountId.split("*")[0]}-RT`,
    effectiveFrom: RETIRE_DATE,
    effectiveUntil: input.effectiveUntil,
  });
}

function toDateString(value: unknown): string {
  return String(new Date(value as Date).toISOString().split("T")[0]);
}

afterAll(async () => {
  if (!dbUrl) return;
  await sql!`SET app.change_process_bypass = 'true'`;
  // Change requests first — staged rows cascade away with them.
  await sql!`DELETE FROM change_requests WHERE reference LIKE ${`${REFERENCE_PREFIX}-%`}`;
  for (const id of changeRequestIds) {
    await sql!`DELETE FROM change_requests WHERE id = ${id}`;
  }
  for (const code of CLIENTS) {
    await sql!`DELETE FROM client_config.portfolio_configuration WHERE client_code = ${code}`;
  }
  for (const code of PORTFOLIOS) {
    await sql!`DELETE FROM client_config.portfolio WHERE portfolio_code = ${code}`;
  }
  for (const code of PARENT_ACCOUNTS) {
    await sql!`DELETE FROM client_config.parent_account WHERE parent_account_code = ${code}`;
  }
  for (const code of CLIENTS) {
    await sql!`DELETE FROM client_config.client WHERE client_code = ${code}`;
  }
});

describe.skipIf(!dbUrl)("retire processing — real database", () => {
  describe.skipIf(!clientId || !retireChangeTypeId)(
    "requires seeded clients and change_type_config",
    () => {
      it("processes a staged DELETE: active_ind=false and effective_until = the requested retirement date (retire-flow staging shape)", async () => {
        // The retire flow stages effective_from = requested retirement date
        // with effective_until = NULL (pre-fix shape). The apply must still
        // close the row at the REQUESTED date, not today.
        const changeRequestId = await createChangeRequest();
        const primaryAccountId = await createLiveRow("RT1", "RT1PF", "RT1_MAIN");

        const staged = await stageDelete({ changeRequestId, primaryAccountId, effectiveUntil: null });
        expect(staged.ok).toBe(true);

        const result = await processChangeForProcessedStatus(
          changeRequestId,
          "portfolio_configuration_retire",
        );

        expect(result.usedLegacy).toBe(false);
        expect(result.applied).toBe(true);
        expect(result.outcomes).toHaveLength(1);
        expect(result.outcomes[0]).toMatchObject({
          actionType: "DELETE",
          primaryAccountId,
          result: "applied",
        });

        // Live row: inactive, effective_until = the requested retirement date.
        const [row] = await sql!`
          SELECT active_ind, effective_until
          FROM client_config.portfolio_configuration
          WHERE primary_account_id = ${primaryAccountId}
        `;
        expect(row).not.toBeNull();
        expect(row.active_ind).toBe(false);
        expect(toDateString(row.effective_until)).toBe(RETIRE_DATE);

        // Staged row flipped to 'applied' without error.
        const [stagedRow] = await sql!`
          SELECT apply_status, apply_error
          FROM client_config.change_portfolio_configuration
          WHERE change_request_id = ${changeRequestId}
        `;
        expect(stagedRow.apply_status).toBe("applied");
        expect(stagedRow.apply_error).toBeNull();

        // No longer returned by the active config view, but history preserved.
        const active = await getClientConfigPortfolioConfigurations();
        expect(active.some((r) => r.primaryAccountId === primaryAccountId)).toBe(false);
        const [count] = await sql!`
          SELECT count(*)::int AS n FROM client_config.portfolio_configuration
          WHERE primary_account_id = ${primaryAccountId}
        `;
        expect(count.n).toBe(1);
      });

      it("uses the explicitly staged effective_until as the retirement date", async () => {
        // The current retire flow (deletePortfolioConfigurationAction) stages
        // the requested date in BOTH effective_from and effective_until; the
        // apply uses effective_until verbatim.
        const changeRequestId = await createChangeRequest();
        const primaryAccountId = await createLiveRow("RT2", "RT2PF", "RT2_MAIN");

        const staged = await stageDelete({ changeRequestId, primaryAccountId, effectiveUntil: "2026-12-31" });
        expect(staged.ok).toBe(true);

        const result = await processChangeForProcessedStatus(
          changeRequestId,
          "portfolio_configuration_retire",
        );
        expect(result.applied).toBe(true);

        const [row] = await sql!`
          SELECT active_ind, effective_until
          FROM client_config.portfolio_configuration
          WHERE primary_account_id = ${primaryAccountId}
        `;
        expect(row.active_ind).toBe(false);
        expect(toDateString(row.effective_until)).toBe("2026-12-31");
      });
    },
  );
});
