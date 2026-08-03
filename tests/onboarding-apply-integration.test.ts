/**
 * Integration tests for the client onboarding apply step against a REAL
 * PostgreSQL database.
 *
 * These tests are skipped when DATABASE_URL is not set. They run in CI inside
 * the e2e-db-test job (see .github/workflows/ci.yml), which applies
 * db/init.sql, runs the runtime migrations (scripts/migrate.mjs), seeds
 * reference data, and then executes the DB-backed tests. They can also be run
 * locally:
 *
 *   DATABASE_URL=postgres://bcm:***@localhost:5432/bcm \
 *     npx vitest run tests/onboarding-apply-integration.test.ts
 *
 * Coverage (the unit-test counterpart lives in
 * tests/onboarding-apply.test.ts):
 *  - successful apply: client + parent_account + portfolio +
 *    portfolio_configuration rows are created in one transaction, staging
 *    row flips to 'applied' with processed_at.
 *  - idempotent re-apply: applying the same change twice is safe — the second
 *    apply skips and no duplicate live rows appear.
 *  - duplicate client code: an already-existing client_config.client row
 *    causes the apply to skip (idempotency backstop).
 *  - transaction rollback: when the portfolio_configuration insert fails (FK
 *    violation on npc_classification_id), the whole transaction rolls back —
 *    no client/portfolio/parent_account rows leak — and the staging row is
 *    marked 'failed' with apply_error.
 *  - processor wiring: processChangeForProcessedStatus dispatches a
 *    customer_onboarding change to the apply step.
 */
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { sql } from "@/lib/db";
import {
  saveClientOnboardingStaging,
  getClientOnboardingStagingByStagingId,
  applyClientOnboardingStaging,
} from "@/lib/onboarding-staging-db";

const dbUrl = process.env.DATABASE_URL;

const CLIENT_CODES = ["QX1", "QX2", "QX3", "QX4", "QX9"] as const;
const PORTFOLIO_CODES = ["QX1PF", "QX2PF", "QX3PF", "QX4PF", "QX9PF"] as const;
const PARENT_ACCOUNT_CODES = ["QX1_MAIN", "QX2_MAIN"] as const;
const REFERENCE_PREFIX = "OB-APPLY-TEST";

let clientId: string | null = null;
let changeTypeId: string | null = null;
const changeRequestIds: string[] = [];

function makePayload(changeRequestId: string, clientCode: string, portfolioCode: string, options: { parentAccountCode?: string | null; npcClassificationId?: number } = {}) {
  return {
    changeRequestId,
    clientCode,
    clientName: `${clientCode} Apply Test Pensioenfonds`,
    portfolioCode,
    parentAccountCode: options.parentAccountCode ?? null,
    assetClassCode: "FI",
    subAssetClassCode: "HYG",
    managerCode: "ROB",
    benchmarkCode: "MSCI-WORLD-NR",
    npcClassificationId: options.npcClassificationId ?? 1,
    longName: `${clientCode} Apply Test Pensioenfonds Hybride`,
    shortName: clientCode,
    effectiveFrom: "2026-01-01",
    effectiveUntil: null,
  };
}

// Lookups run at module load (top-level await) because describe.skipIf is
// evaluated during collection, before any beforeAll hook would have run.
if (dbUrl) {
  // The change-process enforcement triggers (db/enforce_change_process.sql)
  // block direct DML on portfolio_configuration unless the session GUC is
  // set. Cleanup below runs outside the apply transaction, so set the
  // governed-path GUC for this session (harmless when no trigger exists).
  await sql!`SET app.change_process_bypass = 'true'`;

  // Pre-clean leftovers from a previously crashed run.
  await sql!`
    DELETE FROM client_config.client_onboarding_staging WHERE client_code = ANY(${CLIENT_CODES})
  `;
  await sql!`
    DELETE FROM client_config.portfolio_configuration WHERE client_code = ANY(${CLIENT_CODES})
  `;
  await sql!`
    DELETE FROM client_config.portfolio WHERE portfolio_code = ANY(${PORTFOLIO_CODES})
  `;
  await sql!`
    DELETE FROM client_config.parent_account WHERE parent_account_code = ANY(${PARENT_ACCOUNT_CODES})
  `;
  await sql!`
    DELETE FROM client_config.client WHERE client_code = ANY(${CLIENT_CODES})
  `;
  await sql!`DELETE FROM change_requests WHERE reference LIKE ${`${REFERENCE_PREFIX}-%`}`;

  const [client] = await sql!`SELECT id FROM clients ORDER BY created_at LIMIT 1`;
  const [changeType] = await sql!`
    SELECT id FROM change_type_config WHERE slug = 'customer_onboarding' LIMIT 1
  `;
  clientId = client ? String(client.id) : null;
  changeTypeId = changeType ? String(changeType.id) : null;
}

async function createChangeRequest(): Promise<string> {
  const id = randomUUID();
  await sql!`
    INSERT INTO change_requests (
      id, reference, change_type, change_type_id, client_id,
      requested_by, rationale, effective_date, status
    ) VALUES (
      ${id}, ${`${REFERENCE_PREFIX}-${id.slice(0, 8)}`}, 'customer_onboarding',
      ${changeTypeId}, ${clientId}, 'integration-test', 'onboarding apply integration test',
      CURRENT_DATE + INTERVAL '30 days', 'processed'
    )
  `;
  changeRequestIds.push(id);
  return id;
}

afterAll(async () => {
  if (!dbUrl) return;
  await sql!`SET app.change_process_bypass = 'true'`;
  for (const code of CLIENT_CODES) {
    await sql!`DELETE FROM client_config.client_onboarding_staging WHERE client_code = ${code}`;
  }
  // portfolio_configuration rows reference change_requests(id) — delete the
  // live rows first, then the change requests (FK is ON DELETE SET NULL).
  for (const code of CLIENT_CODES) {
    await sql!`DELETE FROM client_config.portfolio_configuration WHERE client_code = ${code}`;
  }
  await sql!`
    DELETE FROM client_config.portfolio WHERE portfolio_code = ANY(${PORTFOLIO_CODES})
  `;
  await sql!`
    DELETE FROM client_config.parent_account WHERE parent_account_code = ANY(${PARENT_ACCOUNT_CODES})
  `;
  for (const code of CLIENT_CODES) {
    await sql!`DELETE FROM client_config.client WHERE client_code = ${code}`;
  }
  for (const id of changeRequestIds) {
    await sql!`DELETE FROM change_requests WHERE id = ${id}`;
  }
  await sql!`
    DELETE FROM change_requests WHERE reference LIKE ${`${REFERENCE_PREFIX}-%`}
  `;
});

describe.skipIf(!dbUrl)("client onboarding apply — real database", () => {
  describe.skipIf(!clientId || !changeTypeId)(
    "requires seeded clients and change_type_config",
    () => {
      it("applies the staged onboarding: client + parent_account + portfolio + portfolio_configuration, staging → applied", async () => {
        const changeRequestId = await createChangeRequest();
        const payload = makePayload(changeRequestId, CLIENT_CODES[0], PORTFOLIO_CODES[0], {
          parentAccountCode: PARENT_ACCOUNT_CODES[0],
        });

        const staged = await saveClientOnboardingStaging(payload);
        const result = await applyClientOnboardingStaging(changeRequestId);

        expect(result.success).toBe(true);
        expect(result.applied).toHaveLength(1);
        expect(result.applied[0]).toMatchObject({
          actionType: "CREATE",
          primaryAccountId: "QX1*FIHYG*ROB",
          result: "applied",
        });

        // Client row.
        const [client] = await sql!`
          SELECT client_code, client_name FROM client_config.client WHERE client_code = ${CLIENT_CODES[0]}
        `;
        expect(client).toMatchObject({
          client_code: "QX1",
          client_name: "QX1 Apply Test Pensioenfonds",
        });

        // Parent account was created and linked to the portfolio.
        const [parentAccount] = await sql!`
          SELECT parent_account_id, active_ind FROM client_config.parent_account
          WHERE parent_account_code = ${PARENT_ACCOUNT_CODES[0]}
        `;
        expect(parentAccount.active_ind).toBe(true);
        const [portfolio] = await sql!`
          SELECT portfolio_code, parent_account_id, active_ind FROM client_config.portfolio
          WHERE portfolio_code = ${PORTFOLIO_CODES[0]}
        `;
        expect(portfolio).toMatchObject({
          portfolio_code: "QX1PF",
          parent_account_id: parentAccount.parent_account_id,
          active_ind: true,
        });

        // Initial portfolio_configuration row with lineage.
        const [pc] = await sql!`
          SELECT primary_account_id, client_code, portfolio_code, asset_class_code,
                 sub_asset_class_code, manager_code, benchmark_code, npc_classification_id,
                 active_ind, effective_from, change_request_id
          FROM client_config.portfolio_configuration
          WHERE change_request_id = ${changeRequestId}
        `;
        expect(pc).toMatchObject({
          primary_account_id: "QX1*FIHYG*ROB",
          client_code: "QX1",
          portfolio_code: "QX1PF",
          asset_class_code: "FI",
          sub_asset_class_code: "HYG",
          manager_code: "ROB",
          benchmark_code: "MSCI-WORLD-NR",
          npc_classification_id: 1,
          active_ind: true,
          change_request_id: changeRequestId,
        });
        expect(String(new Date(pc.effective_from).toISOString().split("T")[0])).toBe("2026-01-01");

        // Staging row flipped to applied with processed_at.
        const after = await getClientOnboardingStagingByStagingId(staged.stagingId);
        expect(after?.status).toBe("applied");
        expect(after?.applyError).toBeNull();
        expect(after?.processedAt).not.toBeNull();
      });

      it("is idempotent: re-applying the same change skips and creates no duplicate rows", async () => {
        const changeRequestId = await createChangeRequest();
        const payload = makePayload(changeRequestId, CLIENT_CODES[1], PORTFOLIO_CODES[1]);

        const staged = await saveClientOnboardingStaging(payload);
        const first = await applyClientOnboardingStaging(changeRequestId);
        expect(first.success).toBe(true);

        const second = await applyClientOnboardingStaging(changeRequestId);

        expect(second.success).toBe(true);
        expect(second.applied).toHaveLength(1);
        expect(second.applied[0]).toMatchObject({
          actionType: "SKIP",
          primaryAccountId: "QX2",
          result: "skipped",
        });

        const [clientCount] = await sql!`
          SELECT count(*)::int AS n FROM client_config.client WHERE client_code = ${CLIENT_CODES[1]}
        `;
        expect(clientCount.n).toBe(1);
        const [pcCount] = await sql!`
          SELECT count(*)::int AS n FROM client_config.portfolio_configuration
          WHERE change_request_id = ${changeRequestId}
        `;
        expect(pcCount.n).toBe(1);
        const after = await getClientOnboardingStagingByStagingId(staged.stagingId);
        expect(after?.status).toBe("applied");
      });

      it("skips when the client already exists (duplicate client code backstop)", async () => {
        const changeRequestId = await createChangeRequest();
        // Pre-existing client row (as if the client was created out-of-band).
        await sql!`
          INSERT INTO client_config.client (client_code, client_name)
          VALUES (${CLIENT_CODES[2]}, ${`${CLIENT_CODES[2]} Pre-existing`})
        `;
        const payload = makePayload(changeRequestId, CLIENT_CODES[2], PORTFOLIO_CODES[2]);
        const staged = await saveClientOnboardingStaging(payload);

        const result = await applyClientOnboardingStaging(changeRequestId);

        expect(result.success).toBe(true);
        expect(result.applied[0]).toMatchObject({ actionType: "SKIP", result: "skipped" });
        // No portfolio / portfolio_configuration rows were created.
        const [pcCount] = await sql!`
          SELECT count(*)::int AS n FROM client_config.portfolio_configuration
          WHERE change_request_id = ${changeRequestId}
        `;
        expect(pcCount.n).toBe(0);
        const [portfolioCount] = await sql!`
          SELECT count(*)::int AS n FROM client_config.portfolio
          WHERE portfolio_code = ${PORTFOLIO_CODES[2]}
        `;
        expect(portfolioCount.n).toBe(0);
        // Staging row is marked applied (processed as a safe skip).
        const after = await getClientOnboardingStagingByStagingId(staged.stagingId);
        expect(after?.status).toBe("applied");
      });

      it("rolls back the whole transaction and marks the staging row failed when a live insert fails", async () => {
        const changeRequestId = await createChangeRequest();
        // npc_classification_id 9999 passes the staging CHECK (no FK on the
        // staging table by design) but violates the live-table FK on
        // portfolio_configuration.npc_classification_id → the apply fails.
        const payload = makePayload(changeRequestId, CLIENT_CODES[3], PORTFOLIO_CODES[3], {
          npcClassificationId: 9999,
        });
        const staged = await saveClientOnboardingStaging(payload);

        const result = await applyClientOnboardingStaging(changeRequestId);

        expect(result.success).toBe(false);
        expect(result.error).toContain("foreign key");

        // The transaction was rolled back — no partial live rows survived.
        const [clientCount] = await sql!`
          SELECT count(*)::int AS n FROM client_config.client WHERE client_code = ${CLIENT_CODES[3]}
        `;
        expect(clientCount.n).toBe(0);
        const [portfolioCount] = await sql!`
          SELECT count(*)::int AS n FROM client_config.portfolio
          WHERE portfolio_code = ${PORTFOLIO_CODES[3]}
        `;
        expect(portfolioCount.n).toBe(0);
        const [pcCount] = await sql!`
          SELECT count(*)::int AS n FROM client_config.portfolio_configuration
          WHERE change_request_id = ${changeRequestId}
        `;
        expect(pcCount.n).toBe(0);

        // The staging row carries the failure so a re-process can retry.
        const after = await getClientOnboardingStagingByStagingId(staged.stagingId);
        expect(after?.status).toBe("failed");
        expect(after?.applyError).toContain("foreign key");
        expect(after?.processedAt).not.toBeNull();

        // A retry succeeds after the reference data is fixed (idempotent retry).
        await sql!`
          UPDATE client_config.client_onboarding_staging
          SET npc_classification_id = 1
          WHERE staging_id = ${staged.stagingId}
        `;
        const retry = await applyClientOnboardingStaging(changeRequestId);
        expect(retry.success).toBe(true);
        const retried = await getClientOnboardingStagingByStagingId(staged.stagingId);
        expect(retried?.status).toBe("applied");
      });

      it("routes a customer_onboarding change through processChangeForProcessedStatus", async () => {
        const changeRequestId = await createChangeRequest();
        const payload = makePayload(changeRequestId, "QX9", "QX9PF");
        await saveClientOnboardingStaging(payload);

        const { processChangeForProcessedStatus } = await import("@/lib/change-processor");
        const result = await processChangeForProcessedStatus(changeRequestId, "customer_onboarding");

        expect(result.applied).toBe(true);
        expect(result.stagedRows).toBe(1);
        expect(result.usedLegacy).toBe(false);
        expect(result.outcomes[0]).toMatchObject({
          actionType: "CREATE",
          primaryAccountId: "QX9*FIHYG*ROB",
          result: "applied",
        });

        const [clientCount] = await sql!`
          SELECT count(*)::int AS n FROM client_config.client WHERE client_code = 'QX9'
        `;
        expect(clientCount.n).toBe(1);
      });
    },
  );
});
