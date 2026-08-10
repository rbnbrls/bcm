/**
 * Regression tests for the legacy `clients` mirror + staging constraint
 * fixes behind issue #532 ("Benchmarkwissel aanvragen werkt niet").
 *
 * Root causes (both proven on bcm.7rb.nl):
 * 1) The legacy public `clients` table in production only has rows for
 *    HOR + ZEK (migrate.mjs's demo data). The LEGACY_CLIENTS mirror in
 *    seed-client-config.mjs only ran on an EMPTY database, so the other
 *    10 client codes (BAK = the DEFAULT first client in the dropdown, …)
 *    have no PF-<CODE>-% row. getPublicClientIdByCode() then returns null
 *    and createBenchmarkChange fails closed with "Klant X is niet
 *    geregistreerd in de klantenadministratie" — the form appears to not
 *    submit at all.
 * 2) Production's client_config.change_portfolio_configuration staging
 *    table was created BEFORE commit 1b853e3 fixed the backslash escaping
 *    in the long_name CHECK constraint. The migration drops the broken
 *    constraint from the LIVE portfolio_configuration table but not from
 *    the STAGING table, so even clients that pass the lookup fail at the
 *    stage INSERT with change_portfolio_configuration_long_name_check.
 *
 * Fix (this PR):
 * - export ensureLegacyClientsMirror(sql) from seed-client-config.mjs and
 *   run it unconditionally from migrate.mjs (idempotent, ON CONFLICT DO
 *   NOTHING) so existing deployments get backfilled on next deploy.
 * - export dropBrokenStagingNameChecks(sql) and call it from migrate.mjs
 *   so the stale staging-table CHECK constraints are removed like the
 *   live-table ones already are.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const queryHandlers = new Map<string, (sql: string, params: unknown[]) => unknown[]>();
const unmatchedSqlLog: string[] = [];

function onQuery(pattern: RegExp, handler: (sql: string, params: unknown[]) => unknown[]) {
  queryHandlers.set(pattern.source, handler);
}

function clearQueryHandlers() {
  queryHandlers.clear();
  unmatchedSqlLog.length = 0;
}

vi.mock("postgres", () => {
  const handlerFn = (strings: unknown, ...values: unknown[]) => {
    if (typeof strings === "string") {
      return { type: "ident" as const, value: strings };
    }
    const parts = strings as TemplateStringsArray;
    let reconstructed = parts[0];
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v && typeof v === "object" && "type" in (v as any) && (v as any).type === "ident") {
        reconstructed += (v as any).value;
      } else {
        reconstructed += `$${i + 1}`;
      }
      reconstructed += parts[i + 1];
    }

    const entries = [...queryHandlers.entries()];
    for (const [patternSource, handler] of entries) {
      try {
        const pattern = new RegExp(patternSource, "is");
        if (pattern.test(reconstructed)) {
          return Promise.resolve(handler(reconstructed, values));
        }
      } catch {
        // skip invalid patterns
      }
    }

    unmatchedSqlLog.push(reconstructed.substring(0, 200));
    return Promise.resolve([]);
  };

  const sql = Object.assign(handlerFn, {
    begin: vi.fn((cb: (tx: unknown) => Promise<unknown>) => cb(handlerFn)),
    end: vi.fn().mockResolvedValue(undefined),
  });

  return { default: vi.fn(() => sql) };
});

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
  clearQueryHandlers();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const LEGACY_BAK = {
  id: "a0000000-0000-4000-a000-000000000008",
  code: "BAK",
  externalReference: "PF-BAK-008",
};

describe("ensureLegacyClientsMirror (#532 legacy clients backfill)", () => {
  it("inserts a legacy clients row for every client_config.client code that lacks one", async () => {
    // client_config.client reports BAK + BOU; the legacy clients table only
    // has PF-HOR-001 (production state before the fix).
    onQuery(/SELECT DISTINCT client_code FROM client_config\.client/i, () => [
      { client_code: "BAK" },
      { client_code: "BOU" },
    ]);
    onQuery(/FROM clients/i, () => [{ external_reference: "PF-HOR-001" }]);

    const inserts: { sqlText: string; params: unknown[] }[] = [];
    onQuery(/INSERT INTO clients/, (sqlText, params) => {
      inserts.push({ sqlText, params });
      return [];
    });

    const { ensureLegacyClientsMirror } = await import("@/scripts/seed-client-config.mjs");
    const count = await ensureLegacyClientsMirror((await import("postgres")).default());

    // Both missing codes get mirrored (HOR already exists → skipped).
    expect(count).toBe(2);
    const allParams = inserts.flatMap((i) => i.params);
    expect(allParams).toContain("PF-BAK-008");
    expect(allParams).toContain("PF-BOU-005");
    expect(allParams).not.toContain("PF-HOR-001");
  });

  it("skips client codes that have no client_config.client row (only mirrors known codes)", async () => {
    onQuery(/SELECT DISTINCT client_code FROM client_config\.client/i, () => [{ client_code: "BAK" }]);
    onQuery(/FROM clients/i, () => []);

    const inserts: { sqlText: string; params: unknown[] }[] = [];
    onQuery(/INSERT INTO clients/, (sqlText, params) => {
      inserts.push({ sqlText, params });
      return [];
    });

    const { ensureLegacyClientsMirror } = await import("@/scripts/seed-client-config.mjs");
    const count = await ensureLegacyClientsMirror((await import("postgres")).default());

    expect(count).toBe(1);
    expect(inserts.length).toBe(1);
    const allParams = inserts.flatMap((i) => i.params);
    expect(allParams).toContain("PF-BAK-008");
    // ZEK exists in LEGACY_CLIENTS but not in client_config.client → skipped.
    expect(allParams).not.toContain("PF-ZEK-002");
  });
});

describe("dropBrokenStagingNameChecks (#532 staging constraint fix)", () => {
  it("drops the stale long_name + short_name CHECK constraints from change_portfolio_configuration", async () => {
    const drops: string[] = [];
    onQuery(/ALTER TABLE/, (sqlText) => {
      drops.push(sqlText);
      return [];
    });

    const { dropBrokenStagingNameChecks } = await import("@/scripts/seed-client-config.mjs");
    await dropBrokenStagingNameChecks((await import("postgres")).default());

    expect(drops.some((q) => q.includes("change_portfolio_configuration_long_name_check"))).toBe(true);
    expect(drops.some((q) => q.includes("change_portfolio_configuration_short_name_check"))).toBe(true);
    // Must target the STAGING table, not the live one ("portfolio_configuration"
    // alone, without the change_ prefix).
    expect(drops.some((q) => /ALTER TABLE client_config\.portfolio_configuration/i.test(q))).toBe(false);
  });
});

describe("LEGACY_CLIENTS data integrity (#532 recurrence guard)", () => {
  it("every LEGACY_CLIENTS entry resolves a client name (no missing PF-<CODE> rows by construction)", async () => {
    const { LEGACY_CLIENTS, CLIENT_NAMES_BY_CODE } = await import("@/scripts/seed-client-config.mjs");
    for (const lc of LEGACY_CLIENTS) {
      expect(CLIENT_NAMES_BY_CODE[lc.code], `missing name for ${lc.code}`).toBeTruthy();
      expect(lc.externalReference).toMatch(new RegExp(`^PF-${lc.code}-\\d{3}$`));
    }
  });
});
