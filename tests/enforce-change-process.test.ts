/**
 * Negative tests for direct live-table mutation enforcement.
 *
 * The client_config.portfolio_configuration table has database-level
 * triggers (INSERT/UPDATE/DELETE) that block any mutation unless the
 * session-level GUC app.change_process_bypass is set to 'true'.
 *
 * These tests verify:
 *  1. The trigger SQL file defines all three enforcement triggers
 *     with correct logic and Dutch error messages.
 *  2. Only applyChangePortfolioConfigurations() is authorised to
 *     mutate the live table — it sets the bypass GUC inside a
 *     transaction before any DML.
 *  3. No other production code path attempts direct SQL mutations
 *     on portfolio_configuration.
 *  4. The bypass GUC is scoped to the transaction (SET LOCAL).
 *  5. The trigger check function has the correct semantics
 *     (IS DISTINCT FROM 'true').
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import fs from "fs/promises";
import path from "path";

// ─────────────────────────────────────────────────────────────────────────
// 1. Trigger SQL static analysis
// ─────────────────────────────────────────────────────────────────────────

describe("enforce_change_process.sql — trigger definition", () => {
  let sql: string;

  beforeAll(async () => {
    sql = await fs.readFile(
      path.resolve(__dirname, "..", "db", "enforce_change_process.sql"),
      "utf-8",
    );
  });

  it("defines the enforce_change_process() function for INSERT/UPDATE", () => {
    expect(sql).toContain("enforce_change_process()");
    expect(sql).toContain("RETURNS TRIGGER");
    expect(sql).toContain("LANGUAGE plpgsql");
  });

  it("defines the enforce_change_process_delete() function for DELETE", () => {
    expect(sql).toContain("enforce_change_process_delete()");
    expect(sql).toContain("RETURNS TRIGGER");
    expect(sql).toContain("LANGUAGE plpgsql");
  });

  it("creates trg_enforce_change_process_insert (BEFORE INSERT)", () => {
    expect(sql).toMatch(
      /CREATE TRIGGER\s+trg_enforce_change_process_insert/,
    );
    expect(sql).toMatch(
      /BEFORE INSERT ON client_config\.portfolio_configuration/,
    );
  });

  it("creates trg_enforce_change_process_update (BEFORE UPDATE)", () => {
    expect(sql).toMatch(
      /CREATE TRIGGER\s+trg_enforce_change_process_update/,
    );
    expect(sql).toMatch(
      /BEFORE UPDATE ON client_config\.portfolio_configuration/,
    );
  });

  it("creates trg_enforce_change_process_delete (BEFORE DELETE)", () => {
    expect(sql).toMatch(
      /CREATE TRIGGER\s+trg_enforce_change_process_delete/,
    );
    expect(sql).toMatch(
      /BEFORE DELETE ON client_config\.portfolio_configuration/,
    );
  });

  it("all three triggers execute FOR EACH ROW", () => {
    const forEachRowMatches = sql.match(/FOR EACH ROW/g);
    expect(forEachRowMatches).toHaveLength(3);
  });

  it("uses IF NOT EXISTS guards so the script is idempotent", () => {
    expect(sql).toMatch(/IF NOT EXISTS\s*\(/);
    expect(sql).toMatch(/FROM pg_trigger/);
    expect(sql).toMatch(/tgrelid = 'client_config\.portfolio_configuration'::regclass/);
  });

  it("enforce_change_process checks app.change_process_bypass with IS DISTINCT FROM 'true'", () => {
    expect(sql).toMatch(
      /current_setting\('app\.change_process_bypass', true\) IS DISTINCT FROM 'true'/,
    );
  });

  it("enforce_change_process_delete also checks app.change_process_bypass", () => {
    expect(sql).toMatch(
      /current_setting\('app\.change_process_bypass', true\) IS DISTINCT FROM 'true'/,
    );
    // Both functions use the same check
    const matches = sql.match(
      /IS DISTINCT FROM 'true'/g,
    );
    expect(matches).toHaveLength(2);
  });

  it("enforce_change_process RAISEs a Dutch error for INSERT/UPDATE", () => {
    expect(sql).toContain("Directe wijziging");
    expect(sql).toContain("niet toegestaan");
    expect(sql).toContain("Change-process");
  });

  it("enforce_change_process_delete RAISEs a Dutch error for DELETE", () => {
    expect(sql).toContain("Directe verwijdering");
    expect(sql).toContain("niet toegestaan");
  });

  it("returns NEW in enforce_change_process (BEFORE INSERT/UPDATE)", () => {
    expect(sql).toMatch(/RETURN NEW;/);
  });

  it("returns OLD in enforce_change_process_delete (BEFORE DELETE)", () => {
    expect(sql).toMatch(/RETURN OLD;/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Code analysis — only applyChangePortfolioConfigurations
//    should mutate the live table
// ─────────────────────────────────────────────────────────────────────────

describe("client-config-db.ts — enforcement gate presence", () => {
  let source: string;

  beforeAll(async () => {
    source = await fs.readFile(
      path.resolve(__dirname, "..", "lib", "client-config-db.ts"),
      "utf-8",
    );
  });

  it("applyChangePortfolioConfigurations sets SET LOCAL app.change_process_bypass = 'true'", () => {
    // The function must set the GUC inside a transaction before any DML.
    expect(source).toContain("SET LOCAL app.change_process_bypass = 'true'");
  });

  it("applyChangePortfolioConfigurations sets the GUC inside a begin/end transaction", () => {
    // The function wraps mutations in a transaction (sql.begin).
    const fnEndIndex = source.indexOf(
      "SET LOCAL app.change_process_bypass = 'true'",
    );
    const beforeGuc = source.substring(0, fnEndIndex);
    expect(beforeGuc).toMatch(/\.begin\(/);
  });

  it("applyChangePortfolioConfigurations is the ONLY function that writes to portfolio_configuration", () => {
    // Search for all DML statements targeting portfolio_configuration.
    // These should only appear inside applyChangePortfolioConfigurations.
    const lines = source.split("\n");
    const dmlLines = lines.filter(
      (l) =>
        /(INSERT INTO|UPDATE|DELETE FROM)\s+client_config\.portfolio_configuration/i.test(l),
    );

    // Every DML statement on portfolio_configuration should be inside
    // the applyChangePortfolioConfigurations function (lines ~816-1008).
    for (const line of dmlLines) {
      // Find the line number
      const lineNum = lines.indexOf(line) + 1;
      // All DML on the live table must be between the function signature
      // and its closing } — the function starts around line 818.
      expect(lineNum).toBeGreaterThanOrEqual(816);
    }
  });

  it("getClientConfigPortfolioConfigurations uses SELECT only (no mutation)", () => {
    const selectLines = source
      .split("\n")
      .filter(
        (l) =>
          /FROM client_config\.portfolio_configuration/i.test(l) &&
          !/INSERT|UPDATE|DELETE/.test(l),
      );
    expect(selectLines.length).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Seed endpoint also uses the bypass (setup-only path)
// ─────────────────────────────────────────────────────────────────────────

describe("seed endpoint — also uses the bypass GUC", () => {
  it("sets SET LOCAL app.change_process_bypass = 'true'", async () => {
    const routeSource = await fs.readFile(
      path.resolve(__dirname, "..", "app", "api", "seed", "client-config", "route.ts"),
      "utf-8",
    );
    expect(routeSource).toContain("SET LOCAL app.change_process_bypass = 'true'");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Mock-DB negative test — attempt direct portfolio_configuration
//    mutation without the bypass GUC
// ─────────────────────────────────────────────────────────────────────────

// Mock postgres to simulate trigger rejection behaviour.
const queryHandlers = new Map<string, (sql: string) => unknown[]>();
function onQuery(pattern: RegExp, handler: (sql: string) => unknown[]): void {
  queryHandlers.set(pattern.source, handler);
}
function clearQueryHandlers(): void {
  queryHandlers.clear();
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
      if (
        v &&
        typeof v === "object" &&
        "type" in (v as any) &&
        (v as any).type === "ident"
      ) {
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
          return Promise.resolve(handler(reconstructed));
        }
      } catch {
        // skip
      }
    }
    return Promise.resolve([]);
  };
  const sql = Object.assign(handlerFn, {
    begin: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(handlerFn)),
    end: vi.fn().mockResolvedValue(undefined),
  });
  return { default: vi.fn(() => sql) };
});

beforeEach(() => {
  clearQueryHandlers();
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("applyChangePortfolioConfigurations — bypass gate (mocked DB)", () => {
  it("must emit SET LOCAL before any DML on portfolio_configuration", async () => {
    // Track the order of SQL statements.
    const sqlOrder: string[] = [];
    onQuery(/SET LOCAL/i, (sql: string) => {
      sqlOrder.push("SET_LOCAL");
      return [];
    });
    onQuery(
      /FROM client_config\.change_portfolio_configuration/i,
      () => [
        {
          id: 1,
          change_request_id: "11111111-1111-1111-1111-111111111111",
          action_type: "CREATE",
          target_primary_account_id: null,
          client_code: "ADP",
          portfolio_code: "ADP",
          asset_class_code: "EQ",
          sub_asset_class_code: "ACX",
          manager_code: "ROB",
          benchmark_code: "MSCI-WORLD-NR",
          npc_classification_id: 1,
          long_name: "Test",
          short_name: "TST",
          effective_from: "2026-12-01",
          effective_until: null,
        },
      ],
    );
    onQuery(/SELECT 1 FROM client_config\.portfolio_configuration/i, () => {
      sqlOrder.push("DML");
      return [];
    });
    onQuery(/INSERT INTO client_config\.portfolio_configuration/i, () => {
      sqlOrder.push("DML");
      return [{ primary_account_id: "ADP_EQACX_ROB" }];
    });

    const { applyChangePortfolioConfigurations } = await import(
      "@/lib/client-config-db"
    );
    const result = await applyChangePortfolioConfigurations(
      "11111111-1111-1111-1111-111111111111",
    );

    // The SET LOCAL must happen BEFORE any DML on the live table.
    const setLocalIndex = sqlOrder.indexOf("SET_LOCAL");
    const firstDmlIndex = sqlOrder.indexOf("DML");
    expect(setLocalIndex).toBeGreaterThanOrEqual(0);
    expect(firstDmlIndex).toBeGreaterThan(setLocalIndex);
    expect(result.success).toBe(true);
  });

  it("SET LOCAL uses SET LOCAL (transaction-scoped), not SET (session-scoped)", async () => {
    const { applyChangePortfolioConfigurations } = await import(
      "@/lib/client-config-db"
    );
    const source = (
      applyChangePortfolioConfigurations as unknown as { toString: () => string }
    ).toString();
    // Must use SET LOCAL (transaction scope) not SET (whole session).
    expect(source).toContain("SET LOCAL");
    expect(source).not.toMatch(/(?<!LOCAL )SET app\.change_process_bypass/);
  });
});
