/**
 * Tests for effective-date lead-time validation.
 *
 * Covers:
 * 1. The pure helper function getMinimumDate / validateEffectiveDate
 * 2. Integration: createNewBenchmark rejects date before today+28
 * 3. Integration: createGenericChangeRequest rejects date before today+leadDays
 * 4. Integration: dispatchClientConfigChange rejects date before today+leadDays
 * 5. Integration: createBenchmarkChange rejects date before today+7
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Postgres mock ──────────────────────────────────────────────────────────
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
    if (typeof strings === "string") return { type: "ident" as const, value: strings };
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
      } catch { /* skip */ }
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

// ── Mock next/navigation redirect ──────────────────────────────────────────
const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { mockRedirect(url); throw new Error("REDIRECT"); },
}));

// ── Helpers ─────────────────────────────────────────────────────────────────
function buildMockFormData(data: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) {
    fd.append(key, value);
  }
  return fd;
}

// ── Global hooks ────────────────────────────────────────────────────────────
beforeEach(() => {
  clearQueryHandlers();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ════════════════════════════════════════════════════════════════════════════
// Pure helper: validateEffectiveDate
// ════════════════════════════════════════════════════════════════════════════
describe("validateEffectiveDate helper", () => {
  it("rejects a date in the past", async () => {
    // This test works with the pure function — import from change-form-utils
    const { validateEffectiveDate } = await import("@/lib/change-form-utils");
    const err = validateEffectiveDate("2020-01-01", 5);
    expect(err).not.toBeNull();
    expect(err).toContain("ingangsdatum");
  });

  it("accepts a date far in the future (beyond lead time)", async () => {
    const { validateEffectiveDate } = await import("@/lib/change-form-utils");
    const farFuture = new Date(Date.now() + 365 * 86400000).toISOString().split("T")[0];
    const err = validateEffectiveDate(farFuture, 5);
    expect(err).toBeNull();
  });

  it("rejects a date that is today (before lead time elapses)", async () => {
    const { validateEffectiveDate, getTodayDateString } = await import("@/lib/change-form-utils");
    const today = getTodayDateString();
    // If lead days > 0, today should be rejected
    const err = validateEffectiveDate(today, 10);
    expect(err).not.toBeNull();
    expect(err).toContain("doorlooptijd");
  });

  it("rejects a date that is too soon for the given lead time", async () => {
    const { validateEffectiveDate, getMinimumDate } = await import("@/lib/change-form-utils");
    const minDate = getMinimumDate(28);
    // Pick one day before the minimum
    const soon = new Date(minDate);
    soon.setDate(soon.getDate() - 1);
    const soonStr = soon.toISOString().split("T")[0];
    const err = validateEffectiveDate(soonStr, 28);
    expect(err).not.toBeNull();
    expect(err).toContain("doorlooptijd");
  });

  it("accepts a date exactly at the minimum (today + leadDays)", async () => {
    const { validateEffectiveDate, getMinimumDate } = await import("@/lib/change-form-utils");
    const minDate = getMinimumDate(7);
    const err = validateEffectiveDate(minDate, 7);
    // Should be null because minDate = today + 7 = exactly the minimum
    // But we use Date internally, so it might be off by one if the function uses en-CA and the test uses toISOString
    // Let's recompute the exact minimum
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const exactMin = d.toLocaleDateString("en-CA");
    const err2 = validateEffectiveDate(exactMin, 7);
    expect(err2).toBeNull();
  });
});

describe("getMinimumDate helper", () => {
  it("returns a date string in YYYY-MM-DD format", async () => {
    const { getMinimumDate } = await import("@/lib/change-form-utils");
    const result = getMinimumDate(5);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns today + 5 days for lead time of 5", async () => {
    const { getMinimumDate, getTodayDateString } = await import("@/lib/change-form-utils");
    const result = getMinimumDate(5);
    const today = new Date(getTodayDateString());
    const expected = new Date(today);
    expected.setDate(expected.getDate() + 5);
    const expectedStr = expected.toLocaleDateString("en-CA");
    expect(result).toBe(expectedStr);
  });

  it("returns today + 0 days for lead time of 0", async () => {
    const { getMinimumDate, getTodayDateString } = await import("@/lib/change-form-utils");
    const result = getMinimumDate(0);
    const expected = getTodayDateString();
    expect(result).toBe(expected);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Integration: createNewBenchmark (lead time: 28 days)
// ════════════════════════════════════════════════════════════════════════════
describe("createNewBenchmark — effective date lead time", () => {
  const VALID_CLIENT_ID = "9f9280fc-9572-49d1-b81c-2a039652bc93";

  function stubMinimalDb() {
    onQuery(/SELECT \* FROM change_type_config WHERE slug/, () => [
      {
        id: "a0000000-0000-0000-0000-000000000002",
        slug: "new_benchmark",
        name: "Nieuwe benchmark",
        description: "",
        category: "benchmark",
        cost: { baseCost: 5000, costCurrency: "EUR", description: "", perItemCost: 0 },
        defaultLeadDays: 28,
        fields: [],
        stakeholders: [],
        workflow: "new_benchmark",
        active: true,
        sortOrder: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    onQuery(/SELECT 1 FROM change_type_config WHERE id/, () => [{ 1: 1 }]);
    onQuery(/FROM clients c/, () => [
      {
        client_id: VALID_CLIENT_ID,
        client_name: "Test Klant",
        client_reference: "TST01",
        portfolio_id: null,
        portfolio_name: null,
        portfolio_reference: null,
        portfolio_current_benchmark_id: null,
        wtp_id: null, wtp_name: null, ac_id: null, ac_name: null,
        m_id: null, m_name: null, bg_id: null, bg_name: null,
      },
    ]);
    onQuery(/SELECT 1 FROM change_requests LIMIT 0/, () => []);
    onQuery(/SELECT 1 FROM audit_log LIMIT 0/, () => []);
    onQuery(/INSERT INTO change_requests/, () => []);
    onQuery(/INSERT INTO new_benchmark_requests/, () => []);
    onQuery(/SELECT COUNT\(\*\)::int AS cnt FROM change_type_config/, () => [{ cnt: 1 }]);
    onQuery(/INSERT INTO change_type_config/, () => []);
  }

  it("rejects effective date before today + 28 days", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    stubMinimalDb();

    const { createNewBenchmark } = await import("@/app/benchmark-aanvraag/actions");

    // Pick a date that is in the future but less than 28 days from now
    const tooSoon = new Date(Date.now() + 10 * 86400000).toISOString().split("T")[0];
    const result = await createNewBenchmark({}, buildMockFormData({
      clientId: VALID_CLIENT_ID,
      requestedBy: "Ruben Verboon",
      rationale: "Test rationale with at least ten characters",
      effectiveDate: tooSoon,
      shortName: "CUSTOM-ESG",
      longName: "Custom ESG Netherlands Benchmark",
      assetClass: "Aandelen",
      currency: "EUR",
    }));

    expect(result.issues).toBeDefined();
    expect(result.issues!.length).toBeGreaterThanOrEqual(1);
    expect(result.issues!.join(" ")).toContain("doorlooptijd");
  });

  it("accepts effective date beyond today + 28 days", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    stubMinimalDb();

    const { createNewBenchmark } = await import("@/app/benchmark-aanvraag/actions");

    const farFuture = new Date(Date.now() + 60 * 86400000).toISOString().split("T")[0];
    mockRedirect.mockClear();

    try {
      await createNewBenchmark({}, buildMockFormData({
        clientId: VALID_CLIENT_ID,
        requestedBy: "Ruben Verboon",
        rationale: "Test rationale with at least ten characters",
        effectiveDate: farFuture,
        shortName: "CUSTOM-ESG",
        longName: "Custom ESG Netherlands Benchmark",
        assetClass: "Aandelen",
        currency: "EUR",
      }));
    } catch { /* redirect throw */ }

    // If we got past the date check, we should have been redirected
    // (DB operations will call redirect)
    expect(mockRedirect).toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Integration: dispatchClientConfigChange (lead time: 5 days, portfolio_addition)
// ════════════════════════════════════════════════════════════════════════════
describe("dispatchClientConfigChange — effective date lead time", () => {
  const VALID_CLIENT_ID = "9f9280fc-9572-49d1-b81c-2a039652bc93";

  function stubMinimalDb() {
    // getClientConfigPortfolioConfigurations
    onQuery(/FROM client_config\.portfolio/i, () => [
      { portfolio_code: "ADP", parent_account_id: 1 },
    ]);
    // Reference data
    onQuery(/FROM client_config\.asset_class/i, () => []);
    onQuery(/FROM client_config\.sub_asset_class/i, () => []);
    onQuery(/FROM client_config\.manager/i, () => []);
    onQuery(/FROM client_config\.benchmark/i, () => []);
    onQuery(/FROM client_config\.npc_classification/i, () => []);
    // getChangeTypeBySlug
    onQuery(/SELECT \* FROM change_type_config WHERE slug/, () => [
      {
        id: "a0000000-0000-0000-0000-000000000006",
        slug: "portfolio_addition",
        name: "Portefeuille toevoegen",
        description: "",
        category: "general",
        cost: { baseCost: 0, costCurrency: "EUR", description: "", perItemCost: 0 },
        defaultLeadDays: 5,
        fields: [],
        stakeholders: [],
        workflow: "default",
        active: true,
        sortOrder: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    // DB existence check for change type config
    onQuery(/SELECT 1 FROM change_type_config WHERE id/, () => [{ 1: 1 }]);
    onQuery(/INSERT INTO change_requests/, () => []);
    onQuery(/INSERT INTO client_config\.change_portfolio_configuration/i, () => [{ id: 1 }]);
  }

  it("rejects effective date before today + 5 days for portfolio_addition", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    stubMinimalDb();

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");

    const tooSoon = new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0];
    const result = await createPortfolioAdditionChange({}, buildMockFormData({
      portfolioCode: "ADP",
      assetClass: "EQUITIES",
      subAssetClass: "AC WORLD",
      managerCode: "ROB",
      benchmarkCode: "MSCI-WORLD-NR",
      npcClassificationId: "1",
      longName: "Test Portfolio",
      shortName: "TST",
      requestedBy: "Test User",
      rationale: "Test rationale with at least ten characters.",
      effectiveDate: tooSoon,
    }));

    expect(result.issues).toBeDefined();
    expect(result.issues!.length).toBeGreaterThanOrEqual(1);
    expect(result.issues!.join(" ")).toContain("doorlooptijd");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Integration: createGenericChangeRequest (dynamic lead time)
// ════════════════════════════════════════════════════════════════════════════
describe("createGenericChangeRequest — effective date lead time", () => {
  const VALID_CLIENT_ID = "9f9280fc-9572-49d1-b81c-2a039652bc93";

  function stubDbForType(slug: string, leadDays: number) {
    onQuery(/SELECT \* FROM change_type_config WHERE id/, () => [
      {
        id: "a0000000-0000-0000-0000-000000000001",
        slug,
        name: "Test Type",
        description: "",
        category: "general",
        cost: { baseCost: 0, costCurrency: "EUR", description: "" },
        defaultLeadDays: leadDays,
        fields: [],
        stakeholders: [],
        workflow: "default",
        active: true,
        sortOrder: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    onQuery(/SELECT \* FROM change_type_config WHERE slug/, () => [
      {
        id: "a0000000-0000-0000-0000-000000000001",
        slug,
        name: "Test Type",
        description: "",
        category: "general",
        cost: { baseCost: 0, costCurrency: "EUR", description: "" },
        defaultLeadDays: leadDays,
        fields: [],
        stakeholders: [],
        workflow: "default",
        active: true,
        sortOrder: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    onQuery(/FROM clients c/, () => [
      {
        client_id: VALID_CLIENT_ID,
        client_name: "Test Klant",
        client_reference: "TST01",
        portfolio_id: null,
        portfolio_name: null,
        portfolio_reference: null,
        portfolio_current_benchmark_id: null,
        wtp_id: null, wtp_name: null, ac_id: null, ac_name: null,
        m_id: null, m_name: null, bg_id: null, bg_name: null,
      },
    ]);
    onQuery(/INSERT INTO change_requests/, () => []);
    onQuery(/SELECT COUNT\(\*\)::int AS cnt FROM change_type_config/, () => [{ cnt: 1 }]);
  }

  it("rejects date before today + 21 days for custodian_change", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    stubDbForType("custodian_change", 21);

    const { createGenericChangeRequest } = await import("@/app/changes/new/generic-actions");

    const tooSoon = new Date(Date.now() + 10 * 86400000).toISOString().split("T")[0];
    const result = await createGenericChangeRequest({}, buildMockFormData({
      changeTypeSlug: "custodian_change",
      clientId: VALID_CLIENT_ID,
      requestedBy: "Test Aanvrager",
      rationale: "Test rationale with at least ten chars.",
      effectiveDate: tooSoon,
    }));

    expect(result.issues).toBeDefined();
    expect(result.issues!.length).toBeGreaterThanOrEqual(1);
    expect(result.issues!.join(" ")).toContain("doorlooptijd");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Integration: createBenchmarkChange (lead time: 7 days)
// ════════════════════════════════════════════════════════════════════════════
describe("createBenchmarkChange — effective date lead time", () => {
  const VALID_PORTFOLIO_ID = "c4707067-b98a-4a0f-92c7-5ee510dc70ff";
  const VALID_BENCHMARK_1 = "9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1";
  const VALID_BENCHMARK_2 = "b9ec8da5-5d7a-4ee0-a23e-9746ded5b43d";
  const VALID_CLIENT_ID = "9f9280fc-9572-49d1-b81c-2a039652bc93";

  function stubDb() {
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
    onQuery(/FROM clients c/, () => [
      {
        client_id: VALID_CLIENT_ID,
        client_name: "Test Klant",
        client_reference: "TST01",
        portfolio_id: VALID_PORTFOLIO_ID,
        portfolio_name: "Test Portfolio",
        portfolio_reference: "TST-PF",
        portfolio_current_benchmark_id: VALID_BENCHMARK_1,
        wtp_id: null, wtp_name: null, ac_id: null, ac_name: null,
        m_id: null, m_name: null, bg_id: null, bg_name: null,
      },
    ]);
    onQuery(/FROM benchmark_catalog/, () => [
      { id: VALID_BENCHMARK_1, code: "BENCH1", name: "Benchmark 1", asset_class: "Aandelen" },
      { id: VALID_BENCHMARK_2, code: "BENCH2", name: "Benchmark 2", asset_class: "Aandelen" },
    ]);
    onQuery(/INSERT INTO change_requests/, () => []);
  }

  it("rejects effective date before today + 7 days for benchmark_switch", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    stubDb();

    const { createBenchmarkChange } = await import("@/app/changes/new/actions");

    const tooSoon = new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0];
    const result = await createBenchmarkChange({}, buildMockFormData({
      clientId: VALID_CLIENT_ID,
      requestedBy: "Ruben Verboon",
      rationale: "Test rationale with at least ten characters",
      effectiveDate: tooSoon,
      items: JSON.stringify([{
        portfolioId: VALID_PORTFOLIO_ID,
        previousBenchmarkId: VALID_BENCHMARK_1,
        requestedBenchmarkId: VALID_BENCHMARK_2,
      }]),
      newBenchmarkItems: "[]",
    }));

    expect(result.issues).toBeDefined();
    expect(result.issues!.length).toBeGreaterThanOrEqual(1);
    expect(result.issues!.join(" ")).toContain("doorlooptijd");
  });
});
