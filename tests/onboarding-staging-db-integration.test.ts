/**
 * Integration tests for the client_onboarding_staging CRUD helpers against a
 * REAL PostgreSQL database.
 *
 * These tests are skipped when DATABASE_URL is not set. They run in CI inside
 * the e2e-db-test job (see .github/workflows/ci.yml), which applies
 * db/init.sql, runs the runtime migrations (scripts/migrate.mjs — creates
 * client_config.client_onboarding_staging), seeds reference data, and then
 * executes the DB-backed tests. They can also be run locally:
 *
 *   DATABASE_URL=postgres://bcm:bcm@localhost:5432/bcm \
 *     npx vitest run tests/onboarding-staging-db-integration.test.ts
 *
 * Coverage: the full CRUD lifecycle plus the two database-enforced error
 * cases — duplicate client code (unique violation on
 * uq_onboarding_client_status) and invalid status values.
 */
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { sql } from "@/lib/db";
import {
  saveClientOnboardingStaging,
  getClientOnboardingStagingByStagingId,
  getClientOnboardingStagingByClientCode,
  updateClientOnboardingStaging,
  deleteClientOnboardingStaging,
  DuplicateClientOnboardingError,
  OnboardingStagingValidationError,
} from "@/lib/onboarding-staging-db";

const dbUrl = process.env.DATABASE_URL;

const CLIENT_CODES = ["QZ9", "QZ8"] as const;
const REFERENCE_PREFIX = "OB-STAGING-TEST";

let clientId: string | null = null;
let changeTypeId: string | null = null;
const changeRequestIds: string[] = [];

// Lookups run at module load (top-level await) because describe.skipIf is
// evaluated during collection, before any beforeAll hook would have run.
if (dbUrl) {
  // Pre-clean leftovers from a previously crashed run (unique constraint on
  // client_code+status and the reference UNIQUE would otherwise collide).
  await sql!`
    DELETE FROM client_config.client_onboarding_staging WHERE client_code = ANY(${CLIENT_CODES})
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
      ${changeTypeId}, ${clientId}, 'integration-test', 'onboarding staging CRUD integration test',
      CURRENT_DATE + INTERVAL '30 days', 'draft'
    )
  `;
  changeRequestIds.push(id);
  return id;
}

afterAll(async () => {
  if (!dbUrl) return;
  for (const code of CLIENT_CODES) {
    await sql!`DELETE FROM client_config.client_onboarding_staging WHERE client_code = ${code}`;
  }
  for (const id of changeRequestIds) {
    await sql!`DELETE FROM change_requests WHERE id = ${id}`;
  }
  await sql!`
    DELETE FROM change_requests WHERE reference LIKE ${`${REFERENCE_PREFIX}-%`}
  `;
});

describe.skipIf(!dbUrl)("client_onboarding_staging CRUD — real database", () => {
  describe.skipIf(!clientId || !changeTypeId)(
    "requires seeded clients and change_type_config",
    () => {
      it("runs the full CRUD lifecycle and enforces the duplicate client code constraint", async () => {
        const changeRequestId = await createChangeRequest();
        const payload = {
          changeRequestId,
          clientCode: CLIENT_CODES[0],
          clientName: "QZ9 Test Pensioenfonds",
          portfolioCode: "QZ9PF",
          parentAccountCode: null,
          assetClassCode: "FI",
          subAssetClassCode: "HYG",
          managerCode: "ROB",
          benchmarkCode: "MSCI-WORLD-NR",
          npcClassificationId: 1,
          longName: "QZ9 Test Pensioenfonds Hybride",
          shortName: "QZ9",
          effectiveFrom: "2026-01-01",
          effectiveUntil: null,
        };

        // 1. save — inserts with status 'pending'
        const saved = await saveClientOnboardingStaging(payload);
        expect(saved.stagingId).toBeGreaterThan(0);
        expect(saved.status).toBe("pending");
        expect(saved.clientCode).toBe("QZ9");
        expect(saved.changeRequestId).toBe(changeRequestId);
        expect(saved.createdAt).toBeTruthy();

        // 2. read by staging id
        const byId = await getClientOnboardingStagingByStagingId(saved.stagingId);
        expect(byId).not.toBeNull();
        expect(byId!.clientName).toBe("QZ9 Test Pensioenfonds");

        // 3. read by client code (with status filter)
        const pending = await getClientOnboardingStagingByClientCode("qz9", {
          status: "pending",
        });
        expect(pending.map((r) => r.stagingId)).toContain(saved.stagingId);
        const all = await getClientOnboardingStagingByClientCode("QZ9");
        expect(all.length).toBeGreaterThanOrEqual(1);

        // 4. duplicate client code → typed error (real unique constraint)
        const otherChangeRequestId = await createChangeRequest();
        await expect(
          saveClientOnboardingStaging({ ...payload, changeRequestId: otherChangeRequestId }),
        ).rejects.toThrow(DuplicateClientOnboardingError);

        // 5. update status + metadata
        const updated = await updateClientOnboardingStaging(saved.stagingId, {
          status: "applied",
          processedAt: "2026-08-02T09:00:00Z",
          longName: "QZ9 Test Pensioenfonds Hybride (toegepast)",
        });
        expect(updated).not.toBeNull();
        expect(updated!.status).toBe("applied");
        expect(updated!.longName).toContain("(toegepast)");
        expect(updated!.processedAt).toContain("2026-08-02");
        expect(updated!.updatedAt > saved.updatedAt).toBe(true);

        // 6. update with an invalid status → validation error
        await expect(
          updateClientOnboardingStaging(saved.stagingId, { status: "bogus" as never }),
        ).rejects.toThrow(OnboardingStagingValidationError);

        // 7. delete — true, then false on second attempt; read returns null
        await expect(deleteClientOnboardingStaging(saved.stagingId)).resolves.toBe(true);
        await expect(deleteClientOnboardingStaging(saved.stagingId)).resolves.toBe(false);
        await expect(
          getClientOnboardingStagingByStagingId(saved.stagingId),
        ).resolves.toBeNull();

        // 8. a second client code can be staged independently (no cross-client conflict)
        const secondRequestId = await createChangeRequest();
        const second = await saveClientOnboardingStaging({
          ...payload,
          changeRequestId: secondRequestId,
          clientCode: CLIENT_CODES[1],
          portfolioCode: "QZ8PF",
          shortName: "QZ8",
          clientName: "QZ8 Test Pensioenfonds",
        });
        expect(second.status).toBe("pending");
        expect(second.clientCode).toBe("QZ8");
        await expect(
          deleteClientOnboardingStaging(second.stagingId),
        ).resolves.toBe(true);
      });
    },
  );
});
