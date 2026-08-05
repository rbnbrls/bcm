/**
 * DB-backed regression test for issue #532 — "Benchmarkwissel aanvragen werkt
 * niet" on bcm.7rb.nl.
 *
 * Reproduces the EXACT production data/schema state that broke the benchmark
 * switch form, then runs the migrate.mjs fix steps and asserts they repair it:
 *
 *  1. Production only had legacy `clients` rows for HOR + ZEK (the LEGACY_CLIENTS
 *     mirror only ran on an empty DB). The default client BAK therefore failed
 *     getPublicClientIdByCode() and createBenchmarkChange() failed closed with
 *     "Klant BAK is niet geregistreerd in de klantenadministratie".
 *  2. Production's client_config.change_portfolio_configuration was created
 *     BEFORE commit 1b853e3 fixed the backslash escaping, so it still carries
 *     the stale long_name CHECK constraint that rejected nearly every real
 *     long_name at the stage INSERT.
 *
 * Run with: DATABASE_URL=postgres://... npx vitest run tests/legacy-clients-mirror-db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";

const HAS_DB = !!process.env.DATABASE_URL;

describe("migrate legacy-clients + staging-constraint repair (#532)", () => {
  it.runIf(HAS_DB)("backfills missing legacy clients rows for every client_config.client code", async () => {
    const { default: postgres } = await import("postgres");
    const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
    try {
      // Simulate production BEFORE the fix: drop the legacy rows for all codes
      // except HOR/ZEK (as if the mirror never ran on this DB).
      await sql`DELETE FROM clients WHERE external_reference NOT LIKE 'PF-HOR-%' AND external_reference NOT LIKE 'PF-ZEK-%'`;

      const { ensureLegacyClientsMirror } = await import("../scripts/seed-client-config.mjs");
      const inserted = await ensureLegacyClientsMirror(sql);
      expect(inserted).toBeGreaterThanOrEqual(10);

      // Every client_config.client code must now resolve a legacy clients row.
      const ccClients = await sql`SELECT client_code FROM client_config.client`;
      for (const row of ccClients) {
        const [legacy] = await sql`
          SELECT id FROM clients WHERE external_reference ILIKE ${`PF-${row.client_code}-%`} LIMIT 1
        `;
        expect(legacy, `no legacy clients row for ${row.client_code}`).toBeTruthy();
      }

      // The mirror must be idempotent: a second run inserts nothing.
      const again = await ensureLegacyClientsMirror(sql);
      expect(again).toBe(0);
    } finally {
      await sql.end();
    }
  }, 30_000);

  it.runIf(HAS_DB)("drops the stale long_name CHECK from change_portfolio_configuration so staging INSERTs succeed", async () => {
    const { default: postgres } = await import("postgres");
    const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
    try {
      // Simulate production BEFORE commit 1b853e3: recreate the stale,
      // backslash-mangled long_name CHECK on the staging table.
      await sql`
        ALTER TABLE client_config.change_portfolio_configuration
        DROP CONSTRAINT IF EXISTS change_portfolio_configuration_long_name_check
      `;
      await sql`
        ALTER TABLE client_config.change_portfolio_configuration
        ADD CONSTRAINT change_portfolio_configuration_long_name_check
        CHECK (long_name ~ '^[^\\r\\n]{1,255}$')
      `;

      const { dropBrokenStagingNameChecks } = await import("../scripts/seed-client-config.mjs");
      await dropBrokenStagingNameChecks(sql);

      const [constraint] = await sql`
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'client_config.change_portfolio_configuration'::regclass
          AND conname = 'change_portfolio_configuration_long_name_check'
      `;
      expect(constraint).toBeUndefined();

      // A real long_name must now stage without a CHECK violation.
      const [clientRow] = await sql`SELECT id FROM clients WHERE external_reference LIKE 'PF-HOR-%' LIMIT 1`;
      const [changeType] = await sql`SELECT id FROM change_type_config WHERE slug = 'benchmark_switch' LIMIT 1`;
      const { randomUUID } = await import("crypto");
      const changeRequestId = randomUUID();
      const [configRow] = await sql`
        SELECT primary_account_id, portfolio_code, client_code, asset_class_code, sub_asset_class_code,
               manager_code, benchmark_code, npc_classification_id, long_name, short_name
        FROM client_config.portfolio_configuration
        WHERE client_code = 'HOR'
        LIMIT 1
      `;
      expect(configRow).toBeTruthy();
      expect(changeType).toBeTruthy();

      await sql`
        INSERT INTO change_requests (id, reference, change_type, change_type_id, client_id, requested_by, rationale, effective_date, status)
        VALUES (${changeRequestId}, ${`T-532-${Date.now()}`}, 'benchmark_switch', ${changeType.id}, ${clientRow.id}, 'TDD test', 'Test rationale for constraint regression', '2026-10-01', 'draft')
      `;
      try {
        await sql`
          INSERT INTO client_config.change_portfolio_configuration (
            change_request_id, action_type, target_primary_account_id,
            client_code, portfolio_code, asset_class_code, sub_asset_class_code,
            manager_code, benchmark_code, npc_classification_id,
            long_name, short_name, effective_from
          ) VALUES (
            ${changeRequestId}, 'UPDATE', ${configRow.primary_account_id},
            ${configRow.client_code}, ${configRow.portfolio_code}, ${configRow.asset_class_code},
            ${configRow.sub_asset_class_code}, ${configRow.manager_code}, ${configRow.benchmark_code},
            ${configRow.npc_classification_id}, ${configRow.long_name}, ${configRow.short_name}, '2026-10-01'
          )
        `;
      } finally {
        await sql`
          DELETE FROM client_config.change_portfolio_configuration WHERE change_request_id = ${changeRequestId}
        `;
        await sql`DELETE FROM change_requests WHERE id = ${changeRequestId}`;
      }
    } finally {
      await sql.end();
    }
  }, 30_000);
});
