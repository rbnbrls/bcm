/**
 * Regression tests for create-benchmark-change client_id resolution.
 *
 * Added for bug report #525: when a client_config client code has no
 * matching row in the legacy public `clients` table (external_reference
 * convention "PF-<CODE>-<NNN>"), the action previously inserted the change
 * request's own randomUUID placeholder into change_requests.client_id,
 * which violated the NOT NULL FK change_requests_client_id_fkey and
 * surfaced as a raw Postgres foreign key violation.
 *
 * The fix (PR #526) fails closed: createBenchmarkChange resolves the real
 * clients.id via getPublicClientIdByCode and returns a user-facing
 * validation error before any INSERT when no row matches.
 *
 * Scenarios covered:
 * 1) Missing clientCode field → schema validation error, no DB writes
 * 2) Client code exists in client_config but has NO legacy clients row
 *    → user-facing validation error, no INSERT, no FK-violation message
 * 3) Valid clients row → change request created with the real clients.id
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

// Mock next/navigation redirect (createBenchmarkChange calls redirect() on success).
const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mockRedirect(url);
    throw new Error("REDIRECT");
  },
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

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
  clearQueryHandlers();
  mockRedirect.mockClear();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/**
 * Stub every query createBenchmarkChange issues, mirroring the benchmark_switch
 * stub in effective-date-lead-time.test.ts. The clients lookup
 * (getPublicClientIdByCode → "SELECT id FROM clients WHERE external_reference
 * ILIKE 'PF-<CODE>-%'") is registered via clientsRows so each test can control
 * whether a legacy clients row exists.
 */
function stubDb(clientsRows: unknown[] = []) {
  // getChangeTypeBySlug("benchmark_switch")
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
  // getBenchmarkSwitchPortfolioOptions
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
  // getClientConfigReferenceData
  onQuery(/FROM client_config\.client/i, () => [
    { client_code: "TST", client_name: "Test Klant" },
  ]);
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
  // getConflictingClientConfigPrimaryAccountIds
  onQuery(/FROM client_config\.change_portfolio_configuration cpc/i, () => []);
  // getPublicClientIdByCode → legacy public clients lookup
  onQuery(/FROM clients/i, () => clientsRows);
  // saveChangeRequest internals
  onQuery(/SELECT 1 FROM change_requests LIMIT 0/, () => []);
  onQuery(/SELECT 1 FROM audit_log LIMIT 0/, () => []);
  onQuery(/SELECT COUNT\(\*\)::int AS cnt FROM change_type_config/, () => [{ cnt: 1 }]);
  onQuery(/INSERT INTO change_type_config/, () => []);
  onQuery(/SELECT 1 FROM change_type_config WHERE id/i, () => [{ 1: 1 }]);
  onQuery(/INSERT INTO change_requests/, () => []);
  // stageChangePortfolioConfiguration
  onQuery(/INSERT INTO client_config\.change_portfolio_configuration/i, () => [{ id: 1 }]);
}

describe("createBenchmarkChange — missing/invalid client_id regression (#525)", () => {
  it("returns a validation error (not an FK violation) when clientCode is missing entirely", async () => {
    stubDb();

    const { createBenchmarkChange } = await import("@/app/changes/new/actions");
    const { clientCode: _omitted, ...formWithoutClientCode } = VALID_FORM;

    const result = await createBenchmarkChange({}, buildMockFormData(formWithoutClientCode));

    // Zod rejects the missing field with a validation issue; the action must
    // never reach the DB or the FK catch-all.
    expect(result.issues).toBeDefined();
    expect(result.issues!.length).toBeGreaterThanOrEqual(1);
    expect(result.issues!.join(" ")).not.toContain("inconsistentie");
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("returns the custom client validation issue for a malformed clientCode", async () => {
    stubDb();

    const { createBenchmarkChange } = await import("@/app/changes/new/actions");

    const result = await createBenchmarkChange(
      {},
      buildMockFormData({ ...VALID_FORM, clientCode: "ABCD" }), // too long for /^[A-Z0-9]{1,3}$/
    );

    expect(result.issues).toBeDefined();
    expect(result.issues!.length).toBeGreaterThanOrEqual(1);
    expect(result.issues!.some((issue) => issue.includes("Selecteer een bestaande klant"))).toBe(true);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("fails closed with a user-facing validation error when no legacy clients row exists — no FK violation, no INSERT", async () => {
    stubDb([]); // getPublicClientIdByCode → null

    let changeRequestInserted = false;
    onQuery(/INSERT INTO change_requests/, () => {
      changeRequestInserted = true;
      return [];
    });

    const { createBenchmarkChange } = await import("@/app/changes/new/actions");

    const result = await createBenchmarkChange({}, buildMockFormData(VALID_FORM));

    // User-facing validation error, not a raw/foreign-key failure.
    expect(result.issues).toBeDefined();
    expect(result.issues!.length).toBeGreaterThanOrEqual(1);
    expect(result.issues!.some((issue) => issue.includes("niet geregistreerd in de klantenadministratie"))).toBe(true);
    // The pre-fix behavior returned the FK catch-all message — assert we never
    // reach that path.
    expect(result.issues!.join(" ")).not.toContain("inconsistentie");
    // No write attempt to change_requests, no redirect.
    expect(changeRequestInserted).toBe(false);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("creates the change request with the real clients.id when a valid client row exists", async () => {
    stubDb([{ id: VALID_CLIENT_ID }]); // getPublicClientIdByCode → VALID_CLIENT_ID

    let changeRequestParams: unknown[] = [];
    onQuery(/INSERT INTO change_requests/, (_sql, params) => {
      changeRequestParams = params;
      return [];
    });

    const { createBenchmarkChange } = await import("@/app/changes/new/actions");

    try {
      await createBenchmarkChange({}, buildMockFormData(VALID_FORM));
    } catch {
      /* redirect throw */
    }

    // The change request was written with the resolved public clients.id —
    // not a randomUUID placeholder (which was the #525 FK-violation bug).
    expect(mockRedirect).toHaveBeenCalledWith(expect.stringMatching(/^\/changes\/[0-9a-f-]{36}$/));
    expect(changeRequestParams).toContain(VALID_CLIENT_ID);
    // Sanity: a random placeholder UUID would not equal the resolved client id.
    expect(changeRequestParams.some((p) => p === VALID_CLIENT_ID)).toBe(true);
  });
});
