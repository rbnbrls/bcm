/**
 * Regression tests for create-benchmark-change constraint-error handling.
 *
 * t_a542b0f4: when a write inside the action violates a DB constraint (e.g.
 * `change_portfolio_configuration_long_name_check`), the action must:
 *   1. log the error with enough context (constraint name, table, SQLSTATE)
 *      via reportError, and
 *   2. return a friendly Dutch message — never the raw PostgreSQL error text
 *      (which names internal schema objects) and never a stack trace.
 *
 * Scenarios covered:
 *   1) check-constraint violation on the staging INSERT → friendly message,
 *      constraint context logged, no raw PG text in issues
 *   2) unique violation → "bestaat al" friendly message
 *   3) non-constraint error → raw message preserved (unchanged behavior)
 *   4) successful submission still redirects (unchanged happy path)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const queryHandlers = new Map<string, (sql: string, params: unknown[]) => unknown>();
const unmatchedSqlLog: string[] = [];

function onQuery(pattern: RegExp, handler: (sql: string, params: unknown[]) => unknown) {
  queryHandlers.set(pattern.source, handler);
}

function clearQueryHandlers() {
  queryHandlers.clear();
  unmatchedSqlLog.length = 0;
}

/** A PostgresError-shaped check-constraint violation (SQLSTATE 23514). */
function checkConstraintError(constraintName: string, tableName: string): Error & {
  code: string;
  severity: string;
  constraint_name: string;
  table_name: string;
} {
  const err = new Error(
    `new row for relation "${tableName}" violates check constraint "${constraintName}"`,
  ) as Error & {
    code: string;
    severity: string;
    constraint_name: string;
    table_name: string;
  };
  err.code = "23514";
  err.severity = "ERROR";
  err.constraint_name = constraintName;
  err.table_name = tableName;
  return err;
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

// Mock next/navigation redirect (createBenchmarkChange calls redirect() on success).
const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mockRedirect(url);
    throw new Error("REDIRECT");
  },
}));

// Spy on reportError so we can assert the logged context.
const reportErrorMock = vi.fn();
vi.mock("@/lib/error-reporter", () => ({
  reportError: (...args: unknown[]) => reportErrorMock(...args),
}));

function buildMockFormData(data: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) {
    fd.append(key, value);
  }
  return fd;
}

const VALID_CLIENT_ID = "9f9280fc-9572-49d1-b81c-2a039652bc93";
const VALID_PRIMARY_ACCOUNT_ID = "TST*EQACX*ROB";
const FUTURE_DATE = new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];

const VALID_FORM = {
  clientCode: "TST",
  primaryAccountId: VALID_PRIMARY_ACCOUNT_ID,
  requestedBenchmarkCode: "BENCH2",
  requestedBy: "Ruben Verboon",
  rationale: "Test rationale with at least ten characters",
  effectiveDate: FUTURE_DATE,
};

/**
 * Stub every query createBenchmarkChange issues, mirroring the benchmark_switch
 * stub in benchmark-change-client-id-regression.test.ts. The staging INSERT
 * handler is configurable so a test can make it throw a constraint error.
 */
function stubDb(options: { stageInsert?: () => unknown[] | Promise<never> } = {}) {
  onQuery(/SELECT \* FROM change_type_config WHERE slug/, () => [
    {
      id: "a0000000-0000-0000-0000-000000000001",
      slug: "benchmark_switch",
      name: "Benchmarkwissel",
      description: "",
      category: "benchmark",
      cost: { baseCost: 0, costCurrency: "EUR", description: "", perItemCost: 500 },
      defaultLeadDays: 7,
      fields: [],
      stakeholders: [],
      workflow: "benchmark_switch",
      active: true,
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]);
  onQuery(/FROM client_config\.portfolio_configuration pc/i, () => [
    {
      primary_account_id: VALID_PRIMARY_ACCOUNT_ID,
      client_code: "TST",
      client_name: "Test Klant",
      portfolio_code: "TSTPF",
      parent_account_id: null,
      parent_account_code: null,
      asset_class_code: "EQ",
      asset_class_name: "EQUITIES",
      sub_asset_class_code: "ACX",
      sub_asset_class_name: "AC WORLD",
      manager_code: "ROB",
      manager_name: "Robeco",
      benchmark_code: "BENCH1",
      benchmark_name: "Benchmark 1",
      npc_classification_id: 1,
      classification_name: "Geen NPC",
      long_name: "Test Portfolio",
      short_name: "TST EQ ACX",
      active_ind: true,
      effective_from: "2026-01-01",
      effective_until: null,
      change_request_id: null,
    },
  ]);
  onQuery(/FROM client_config\.client/i, () => [{ client_code: "TST", client_name: "Test Klant" }]);
  onQuery(/FROM client_config\.portfolio\s/i, () => [
    { portfolio_id: 1, portfolio_code: "TSTPF", parent_account_id: null, active_ind: true },
  ]);
  onQuery(/FROM client_config\.asset_class/i, () => [
    { asset_class_id: 1, asset_class_code: "EQ", asset_class_name: "EQUITIES" },
  ]);
  onQuery(/FROM client_config\.sub_asset_class/i, () => [
    { sub_asset_class_id: 1, asset_class_id: 1, sub_asset_class_code: "ACX", sub_asset_class_name: "AC WORLD" },
  ]);
  onQuery(/FROM client_config\.manager/i, () => [
    { manager_id: 1, manager_code: "ROB", manager_name: "Robeco" },
  ]);
  onQuery(/FROM client_config\.benchmark/i, () => [
    { benchmark_id: 1, benchmark_code: "BENCH1", benchmark_name: "Benchmark 1", rimes_code: null },
    { benchmark_id: 2, benchmark_code: "BENCH2", benchmark_name: "Benchmark 2", rimes_code: null },
  ]);
  onQuery(/FROM client_config\.npc_classification/i, () => [
    { npc_classification_id: 1, classification_name: "Geen NPC" },
  ]);
  onQuery(/FROM client_config\.parent_account/i, () => []);
  onQuery(/FROM client_config\.change_portfolio_configuration cpc/i, () => []);
  onQuery(/FROM clients/i, () => [{ id: VALID_CLIENT_ID }]);
  onQuery(/SELECT 1 FROM change_requests LIMIT 0/, () => []);
  onQuery(/SELECT 1 FROM audit_log LIMIT 0/, () => []);
  onQuery(/SELECT COUNT\(\*\)::int AS cnt FROM change_type_config/, () => [{ cnt: 1 }]);
  onQuery(/INSERT INTO change_type_config/, () => []);
  onQuery(/SELECT 1 FROM change_type_config WHERE id/i, () => [{ 1: 1 }]);
  onQuery(/INSERT INTO change_requests/, () => []);
  // stageChangePortfolioConfiguration → saveChangePortfolioConfiguration
  onQuery(/INSERT INTO client_config\.change_portfolio_configuration/i, () =>
    options.stageInsert ? options.stageInsert() : Promise.resolve([{ id: 1 }]),
  );
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
  clearQueryHandlers();
  mockRedirect.mockClear();
  reportErrorMock.mockClear();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("createBenchmarkChange — DB constraint error handling (t_a542b0f4)", () => {
  it("returns a friendly message for a long_name CHECK violation — no raw PG text, context logged", async () => {
    stubDb({
      stageInsert: () => {
        // The mock's handler wrapper resolves whatever the handler returns,
        // so reject asynchronously (a synchronous throw would be swallowed
        // by the mock's pattern-scan catch block).
        return Promise.reject(
          checkConstraintError(
            "change_portfolio_configuration_long_name_check",
            "change_portfolio_configuration",
          ),
        );
      },
    });

    const { createBenchmarkChange } = await import("@/app/changes/new/actions");
    const result = await createBenchmarkChange({}, buildMockFormData(VALID_FORM));

    // Friendly Dutch message, never the raw constraint/relation names.
    expect(result.issues).toBeDefined();
    expect(result.issues!.length).toBeGreaterThanOrEqual(1);
    expect(result.issues!.join(" ")).toMatch(/databasebeperking/);
    expect(result.issues!.join(" ")).not.toContain("change_portfolio_configuration_long_name_check");
    expect(result.issues!.join(" ")).not.toContain("violates");
    expect(result.issues!.join(" ")).not.toContain("PostgresError");
    expect(result.issues!.join(" ")).not.toContain("at ");
    // No redirect after an error.
    expect(mockRedirect).not.toHaveBeenCalled();

    // reportError got the constraint context for diagnostics.
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    const [err, context] = reportErrorMock.mock.calls[0] as [Error, Record<string, unknown>];
    expect(err.message).toContain("change_portfolio_configuration_long_name_check");
    expect(context.action).toBe("create-benchmark-change");
    expect(context.tags).toMatchObject({
      constraint: "change_portfolio_configuration_long_name_check",
      table: "change_portfolio_configuration",
      sqlstate: "23514",
    });
    // The friendly message is attached to the report for issue context.
    expect(context.userMessage).toMatch(/databasebeperking/);
  });

  it("maps a unique violation to its specific friendly message", async () => {
    const uniqueErr = checkConstraintError("uq_some_unique", "some_table");
    uniqueErr.code = "23505";
    stubDb({ stageInsert: () => Promise.reject(uniqueErr) });

    const { createBenchmarkChange } = await import("@/app/changes/new/actions");
    const result = await createBenchmarkChange({}, buildMockFormData(VALID_FORM));

    expect(result.issues!.join(" ")).toMatch(/bestaat al/);
    expect(result.issues!.join(" ")).not.toContain("uq_some_unique");
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect((reportErrorMock.mock.calls[0][1] as Record<string, unknown>).tags).toMatchObject({
      sqlstate: "23505",
    });
  });

  it("keeps returning the raw message for non-constraint errors (unchanged behavior)", async () => {
    stubDb({
      stageInsert: () => Promise.reject(new Error("Connection reset by peer")),
    });

    const { createBenchmarkChange } = await import("@/app/changes/new/actions");
    const result = await createBenchmarkChange({}, buildMockFormData(VALID_FORM));

    expect(result.issues).toEqual(["Connection reset by peer"]);
    // Still logged, but no constraint tags.
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    const context = reportErrorMock.mock.calls[0][1] as Record<string, unknown>;
    expect(context.tags).toBeUndefined();
    expect(context.userMessage).toBeUndefined();
  });

  it("still redirects on a successful submission (happy path unchanged)", async () => {
    stubDb();

    const { createBenchmarkChange } = await import("@/app/changes/new/actions");
    try {
      await createBenchmarkChange({}, buildMockFormData(VALID_FORM));
    } catch {
      /* redirect throw */
    }

    expect(mockRedirect).toHaveBeenCalledWith(expect.stringMatching(/^\/changes\/[0-9a-f-]{36}$/));
    expect(reportErrorMock).not.toHaveBeenCalled();
  });
});
