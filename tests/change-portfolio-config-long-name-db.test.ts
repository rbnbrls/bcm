/**
 * DB-backed regression tests for the change_portfolio_configuration.long_name
 * validation boundary (t_a542b0f4, follow-up to #533/#534).
 *
 * The live portfolio_configuration table and the change_portfolio_configuration
 * staging table both carry a name CHECK constraint intended to be:
 *   `column ~ '^[^CR][^LF]{1,N}$'` — 1..N chars, no CR/LF — written
 *   escape-free via chr(13)/chr(10) concatenation so the historical
 *   backslash-mangling bug (which turned the negated class into [^\\r\\n],
 *   forbidding the literal characters \ r n) can never recur.
 *
 * This suite pins the DB-level boundary to the application-side validation
 * (lib/validation-rules.ts FIELD_LIMITS):
 *   - exactly FIELD_LIMITS.longName (255) chars  → INSERT succeeds
 *   - FIELD_LIMITS.longName + 1 (256) chars       → rejected by the CHECK
 *   - CR / LF inside the name                     → rejected by the CHECK
 *   - the stored constraint definition must be the escape-free chr(13)/chr(10)
 *     form whose {1,N} matches FIELD_LIMITS (migration-applies check)
 *
 * Run with: DATABASE_URL=postgres://... npx vitest run tests/change-portfolio-config-long-name-db.test.ts
 * (CI: e2e-db-test job, after db:migrate + db:seed)
 */
import { describe, it, expect, beforeAll } from "vitest";
import { FIELD_LIMITS } from "@/lib/validation-rules";

const HAS_DB = !!process.env.DATABASE_URL;

describe("change_portfolio_configuration.long_name CHECK boundary (#533/#534 regression)", () => {
  // postgres.js Sql instance (only loaded when HAS_DB is set).
  let sql: any;
  let configRow: {
    primary_account_id: string;
    client_code: string;
    portfolio_code: string;
    asset_class_code: string;
    sub_asset_class_code: string;
    manager_code: string;
    benchmark_code: string;
    npc_classification_id: number;
    short_name: string;
  };
  let changeRequestId: string;
  let changeRequestReference: string;

  beforeAll(async () => {
    if (!HAS_DB) return;
    const { default: postgres } = await import("postgres");
    sql = postgres(process.env.DATABASE_URL!, { max: 1 });

    // Pick a real live row to satisfy every FK on the staging table.
    const [row] = await sql`
      SELECT primary_account_id, client_code, portfolio_code, asset_class_code,
             sub_asset_class_code, manager_code, benchmark_code,
             npc_classification_id, short_name
      FROM client_config.portfolio_configuration
      LIMIT 1
    `;
    expect(row, "seed data required (run db:seed)").toBeTruthy();
    configRow = row;

    const [clientRow] = await sql`SELECT id FROM clients WHERE external_reference LIKE 'PF-HOR-%' LIMIT 1`;
    const [changeType] = await sql`SELECT id FROM change_type_config WHERE slug = 'benchmark_switch' LIMIT 1`;
    expect(clientRow, "legacy clients row required (run db:seed)").toBeTruthy();
    expect(changeType, "benchmark_switch change type required (run db:seed)").toBeTruthy();

    const { randomUUID } = await import("crypto");
    changeRequestId = randomUUID();
    changeRequestReference = `T-LN-${Date.now()}`;
    await sql`
      INSERT INTO change_requests (id, reference, change_type, change_type_id, client_id, requested_by, rationale, effective_date, status)
      VALUES (${changeRequestId}, ${changeRequestReference}, 'benchmark_switch', ${changeType.id}, ${clientRow.id}, 'TDD test', 'long_name boundary regression', '2026-10-01', 'draft')
    `;
  });

  afterAll(async () => {
    if (!HAS_DB) return;
    try {
      await sql`DELETE FROM client_config.change_portfolio_configuration WHERE change_request_id = ${changeRequestId}`;
      await sql`DELETE FROM change_requests WHERE id = ${changeRequestId}`;
    } finally {
      await sql.end();
    }
  });

  /** Raw INSERT into the staging table (bypasses app validation on purpose). */
  const stageInsert = (longName: string, shortName: string) => sql`
    INSERT INTO client_config.change_portfolio_configuration (
      change_request_id, action_type, target_primary_account_id,
      client_code, portfolio_code, asset_class_code, sub_asset_class_code,
      manager_code, benchmark_code, npc_classification_id,
      long_name, short_name, effective_from
    ) VALUES (
      ${changeRequestId}, 'UPDATE', ${configRow.primary_account_id},
      ${configRow.client_code}, ${configRow.portfolio_code}, ${configRow.asset_class_code},
      ${configRow.sub_asset_class_code}, ${configRow.manager_code}, ${configRow.benchmark_code},
      ${configRow.npc_classification_id}, ${longName}, ${shortName}, '2026-10-01'
    )
  `;

  describe.skipIf(!HAS_DB)("DB CHECK vs application boundary", () => {
    it("accepts a long_name of exactly FIELD_LIMITS.longName (255) chars — realistic content with 'r'/'n'", async () => {
      const prefix = "Lange naam met letters r en n - ";
      const longName = prefix + "x".repeat(FIELD_LIMITS.longName - prefix.length);
      expect(longName.length).toBe(FIELD_LIMITS.longName);
      await expect(stageInsert(longName, configRow.short_name)).resolves.toBeDefined();
      // clean up the row so the over-length tests below start empty
      await sql`DELETE FROM client_config.change_portfolio_configuration WHERE change_request_id = ${changeRequestId}`;
    });

    it("rejects a long_name one char over the boundary (256 > 255) with the CHECK constraint (23514)", async () => {
      const longName = "x".repeat(FIELD_LIMITS.longName + 1);
      await expect(stageInsert(longName, configRow.short_name)).rejects.toThrow(
        /change_portfolio_configuration_long_name_check|23514|22001|too long/,
      );
    });

    it("rejects a long_name containing a line feed", async () => {
      await expect(stageInsert("Naam met\nregeleinde", configRow.short_name)).rejects.toThrow(
        /change_portfolio_configuration_long_name_check|23514/,
      );
    });

    it("rejects a long_name containing a carriage return", async () => {
      await expect(stageInsert("Naam met\rregeleinde", configRow.short_name)).rejects.toThrow(
        /change_portfolio_configuration_long_name_check|23514/,
      );
    });

    it("rejects an empty long_name (CHECK requires 1..N chars)", async () => {
      await expect(stageInsert("", configRow.short_name)).rejects.toThrow(
        /change_portfolio_configuration_long_name_check|23514/,
      );
    });
  });

  describe.skipIf(!HAS_DB)("migration applied: stored constraint matches application validation", () => {
    it("long_name and short_name CHECKs are the escape-free chr(13)/chr(10) form with FIELD_LIMITS boundaries", async () => {
      const rows = await sql`
        SELECT conname, pg_get_constraintdef(oid) AS def
        FROM pg_constraint
        WHERE conrelid = 'client_config.change_portfolio_configuration'::regclass
          AND contype = 'c'
          AND conname IN ('change_portfolio_configuration_long_name_check', 'change_portfolio_configuration_short_name_check')
      `;
      const byName: Record<string, string> = Object.fromEntries(
        (rows as Array<{ conname: string; def: string }>).map((r) => [r.conname, r.def]),
      );

      const longDef = byName["change_portfolio_configuration_long_name_check"];
      expect(longDef, "long_name CHECK must exist after migrate (7h.1)").toBeTruthy();
      expect(longDef).toContain("chr(13)");
      expect(longDef).toContain("chr(10)");
      // The mangled form stored literal backslash escapes; the fixed form has none.
      expect(longDef).not.toContain("\\");
      // The {1,N} boundary must equal the application-side limit.
      expect(longDef).toContain(`{1,${FIELD_LIMITS.longName}}`);

      const shortDef = byName["change_portfolio_configuration_short_name_check"];
      expect(shortDef, "short_name CHECK must exist after migrate (7h.1)").toBeTruthy();
      expect(shortDef).toContain(`{1,${FIELD_LIMITS.shortName}}`);
      expect(shortDef).not.toContain("\\");
    });
  });
});
