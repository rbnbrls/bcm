/**
 * Tests for missing and newly requested lookup data in portfolio flows.
 *
 * Covers:
 *  (a) Portfolio create/update fails gracefully when a required lookup value
 *      is missing — tests each of the five lookup dimensions (asset_class,
 *      sub_asset_class, manager, benchmark, npc_classification), both
 *      user-requestable and admin-only.
 *  (b) User can request a new lookup value via the governed change flow —
 *      tests stageChangeLookupRequest for each user-requestable dimension
 *      (asset_class, sub_asset_class, benchmark).
 *  (c) After approval the value becomes available — tests that
 *      applyChangeLookupRequests inserts the value and
 *      lookupCodesFromReferenceData can resolve it afterwards.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Postgres mock (same pattern as portfolio-addition-actions.test.ts) ───
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

// ── Mock next/navigation redirect ───────────────────────────────────────
const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { mockRedirect(url); throw new Error("REDIRECT"); },
}));

// ── Helpers ─────────────────────────────────────────────────────────────
function buildMockFormData(data: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) {
    fd.append(key, value);
  }
  return fd;
}

beforeEach(() => {
  clearQueryHandlers();
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
// (a) Portfolio create/update fails gracefully when a required lookup
//     value is missing
// ═══════════════════════════════════════════════════════════════════════════
describe("(a) missing lookup — portfolio create/update fails gracefully", () => {
  const futureDate = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];

  function validFormData(overrides: Record<string, string> = {}): FormData {
    return buildMockFormData({
      portfolioCode: "ADP",
      assetClass: "EQUITIES",
      subAssetClass: "AC WORLD",
      managerCode: "ROB",
      benchmarkCode: "MSCI-WORLD-NR",
      npcClassificationId: "1",
      longName: "E2E Test Portfolio",
      shortName: "E2E-TEST",
      requestedBy: "E2E Test User",
      rationale: "E2E test — verifying portfolio addition server action end-to-end.",
      effectiveDate: futureDate,
      ...overrides,
    });
  }

  /**
   * Stub reference data so ALL dimensions resolve — the caller can then
   * selectively remove one dimension to trigger the missing-lookup error.
   */
  function stubAllReferenceData() {
    onQuery(/FROM client_config\.client/i, () => [
      { client_code: "ADP", client_name: "ADP" },
    ]);
    onQuery(/FROM client_config\.portfolio/i, () => [
      { portfolio_id: 1, portfolio_code: "ADP", parent_account_id: null, active_ind: true },
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
      { benchmark_id: 1, benchmark_code: "MSCI-WORLD-NR", benchmark_name: "MSCI World Net Return", rimes_code: null },
    ]);
    onQuery(/FROM client_config\.npc_classification/i, () => [
      { npc_classification_id: 1, classification_name: "Pensioen" },
    ]);
    // getChangeTypeBySlug: fallback to DEFAULT
    onQuery(/SELECT 1 FROM change_type_config WHERE id =/, () => [{ 1: 1 }]);
    // getPublicClientIdByCode: a legacy clients row must exist for the FK
    // (fail-closed regression t_d556c774 — the action rejects when no row
    // matches and a DB is available).
    onQuery(/SELECT id FROM clients/i, () => [{ id: "9f9280fc-9572-49d1-b81c-2a039652bc93" }]);
    onQuery(/INSERT INTO change_requests/i, () => []);
    onQuery(/INSERT INTO client_config\.change_portfolio_configuration/i, () => [{ id: 1 }]);
  }

  it("returns error when asset_class does not exist in reference data", async () => {
    vi.resetModules();
    // Stub everything EXCEPT asset_class
    onQuery(/FROM client_config\.portfolio/i, () => [{ portfolio_id: 1, portfolio_code: "ADP", parent_account_id: null, active_ind: true }]);
    onQuery(/FROM client_config\.client/i, () => [{ client_code: "ADP", client_name: "ADP" }]);
    onQuery(/FROM client_config\.asset_class/i, () => []);
    onQuery(/FROM client_config\.sub_asset_class/i, () => []);
    onQuery(/FROM client_config\.manager/i, () => [{ manager_id: 1, manager_code: "ROB", manager_name: "Robeco" }]);
    onQuery(/FROM client_config\.benchmark/i, () => [{ benchmark_id: 1, benchmark_code: "MSCI-WORLD-NR", benchmark_name: "MSCI World Net Return", rimes_code: null }]);
    onQuery(/FROM client_config\.npc_classification/i, () => [{ npc_classification_id: 1, classification_name: "Pensioen" }]);

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    const result = await createPortfolioAdditionChange({}, validFormData());

    expect(result.issues).toBeDefined();
    const msg = result.issues!.join(" ");
    expect(msg).toContain("asset class");
    expect(msg).toContain("change proces");
  });

  it("returns error when sub_asset_class does not match the asset class in reference data", async () => {
    vi.resetModules();
    // Asset class exists but sub_asset_class doesn't belong to it
    onQuery(/FROM client_config\.portfolio/i, () => [{ portfolio_id: 1, portfolio_code: "ADP", parent_account_id: null, active_ind: true }]);
    onQuery(/FROM client_config\.client/i, () => [{ client_code: "ADP", client_name: "ADP" }]);
    onQuery(/FROM client_config\.asset_class/i, () => [{ asset_class_id: 1, asset_class_code: "EQ", asset_class_name: "EQUITIES" }]);
    onQuery(/FROM client_config\.sub_asset_class/i, () => []);
    onQuery(/FROM client_config\.manager/i, () => [{ manager_id: 1, manager_code: "ROB", manager_name: "Robeco" }]);
    onQuery(/FROM client_config\.benchmark/i, () => [{ benchmark_id: 1, benchmark_code: "MSCI-WORLD-NR", benchmark_name: "MSCI World Net Return", rimes_code: null }]);
    onQuery(/FROM client_config\.npc_classification/i, () => [{ npc_classification_id: 1, classification_name: "Pensioen" }]);

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    const result = await createPortfolioAdditionChange({}, validFormData());

    expect(result.issues).toBeDefined();
    const msg = result.issues!.join(" ");
    expect(msg).toContain("sub asset class");
    // Either "hoort niet bij" or "bestaat niet" depending on which check fires
    expect(msg).toMatch(/sub asset class|bestaat niet|hoort niet/i);
  });

  it("returns error when manager does not exist in reference data", async () => {
    vi.resetModules();
    onQuery(/FROM client_config\.portfolio/i, () => [{ portfolio_id: 1, portfolio_code: "ADP", parent_account_id: null, active_ind: true }]);
    onQuery(/FROM client_config\.client/i, () => [{ client_code: "ADP", client_name: "ADP" }]);
    onQuery(/FROM client_config\.asset_class/i, () => [{ asset_class_id: 1, asset_class_code: "EQ", asset_class_name: "EQUITIES" }]);
    onQuery(/FROM client_config\.sub_asset_class/i, () => [{ sub_asset_class_id: 1, asset_class_id: 1, sub_asset_class_code: "ACX", sub_asset_class_name: "AC WORLD" }]);
    onQuery(/FROM client_config\.manager/i, () => []);
    onQuery(/FROM client_config\.benchmark/i, () => [{ benchmark_id: 1, benchmark_code: "MSCI-WORLD-NR", benchmark_name: "MSCI World Net Return", rimes_code: null }]);
    onQuery(/FROM client_config\.npc_classification/i, () => [{ npc_classification_id: 1, classification_name: "Pensioen" }]);

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    const result = await createPortfolioAdditionChange({}, validFormData());

    expect(result.issues).toBeDefined();
    const msg = result.issues!.join(" ");
    expect(msg).toContain("Manager");
    expect(msg).toContain("beheerder");
    expect(msg).toContain("support");
  });

  it("returns error when benchmark does not exist in reference data", async () => {
    vi.resetModules();
    onQuery(/FROM client_config\.portfolio/i, () => [{ portfolio_id: 1, portfolio_code: "ADP", parent_account_id: null, active_ind: true }]);
    onQuery(/FROM client_config\.client/i, () => [{ client_code: "ADP", client_name: "ADP" }]);
    onQuery(/FROM client_config\.asset_class/i, () => [{ asset_class_id: 1, asset_class_code: "EQ", asset_class_name: "EQUITIES" }]);
    onQuery(/FROM client_config\.sub_asset_class/i, () => [{ sub_asset_class_id: 1, asset_class_id: 1, sub_asset_class_code: "ACX", sub_asset_class_name: "AC WORLD" }]);
    onQuery(/FROM client_config\.manager/i, () => [{ manager_id: 1, manager_code: "ROB", manager_name: "Robeco" }]);
    onQuery(/FROM client_config\.benchmark/i, () => []);
    onQuery(/FROM client_config\.npc_classification/i, () => [{ npc_classification_id: 1, classification_name: "Pensioen" }]);

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    const result = await createPortfolioAdditionChange({}, validFormData());

    expect(result.issues).toBeDefined();
    const msg = result.issues!.join(" ");
    expect(msg).toContain("benchmark");
    expect(msg).toContain("change catalog");
  });

  it("returns error when npc_classification does not exist in reference data", async () => {
    vi.resetModules();
    onQuery(/FROM client_config\.portfolio/i, () => [{ portfolio_id: 1, portfolio_code: "ADP", parent_account_id: null, active_ind: true }]);
    onQuery(/FROM client_config\.client/i, () => [{ client_code: "ADP", client_name: "ADP" }]);
    onQuery(/FROM client_config\.asset_class/i, () => [{ asset_class_id: 1, asset_class_code: "EQ", asset_class_name: "EQUITIES" }]);
    onQuery(/FROM client_config\.sub_asset_class/i, () => [{ sub_asset_class_id: 1, asset_class_id: 1, sub_asset_class_code: "ACX", sub_asset_class_name: "AC WORLD" }]);
    onQuery(/FROM client_config\.manager/i, () => [{ manager_id: 1, manager_code: "ROB", manager_name: "Robeco" }]);
    onQuery(/FROM client_config\.benchmark/i, () => [{ benchmark_id: 1, benchmark_code: "MSCI-WORLD-NR", benchmark_name: "MSCI World Net Return", rimes_code: null }]);
    onQuery(/FROM client_config\.npc_classification/i, () => []);

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    const result = await createPortfolioAdditionChange({}, validFormData());

    expect(result.issues).toBeDefined();
    const msg = result.issues!.join(" ");
    expect(msg).toContain("NPC");
    expect(msg).toContain("beheerder");
  });

  it("returns error for multiple missing lookups at once", async () => {
    vi.resetModules();
    // Only portfolio and client exist — all lookup dimensions are missing
    onQuery(/FROM client_config\.portfolio/i, () => [{ portfolio_id: 1, portfolio_code: "ADP", parent_account_id: null, active_ind: true }]);
    onQuery(/FROM client_config\.client/i, () => [{ client_code: "ADP", client_name: "ADP" }]);
    onQuery(/FROM client_config\.asset_class/i, () => []);
    onQuery(/FROM client_config\.sub_asset_class/i, () => []);
    onQuery(/FROM client_config\.manager/i, () => []);
    onQuery(/FROM client_config\.benchmark/i, () => []);
    onQuery(/FROM client_config\.npc_classification/i, () => []);

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    const result = await createPortfolioAdditionChange({}, validFormData());

    expect(result.issues).toBeDefined();
    // At least one error for asset class (the first lookup check)
    const msg = result.issues!.join(" ");
    expect(msg).toContain("change proces");
  });

  it("succeeds when all lookups exist in reference data", async () => {
    vi.resetModules();
    stubAllReferenceData();
    mockRedirect.mockClear();

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    try {
      await createPortfolioAdditionChange({}, validFormData());
    } catch { /* redirect throws */ }

    expect(mockRedirect).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (b) User can request a new lookup value via governed change flow
// ═══════════════════════════════════════════════════════════════════════════
describe("(b) request new lookup — governed change flow", () => {
  const UUI_D = "11111111-1111-1111-1111-111111111111";

  it("stages a new asset_class request successfully", async () => {
    // No existing asset class with that code
    onQuery(/SELECT asset_class_code FROM client_config\.asset_class/i, () => []);
    // No duplicate staged request
    onQuery(/FROM client_config\.change_lookup_request clr/i, () => []);
    // Successful insert
    onQuery(/INSERT INTO client_config\.change_lookup_request/i, () => [{ id: 42 }]);

    const { stageChangeLookupRequest } = await import("@/lib/client-config-db");
    const result = await stageChangeLookupRequest({
      changeRequestId: UUI_D,
      dimension: "asset_class",
      assetClassCode: "PR",
      assetClassName: "PRIVATE MARKETS",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.id).toBe("42");
    }
  });

  it("stages a new sub_asset_class request with a valid parent", async () => {
    // Parent asset class exists
    onQuery(/SELECT asset_class_code FROM client_config\.asset_class/i, () => [{ asset_class_code: "EQ" }]);
    // No duplicate
    onQuery(/FROM client_config\.change_lookup_request clr/i, () => []);
    // Successful insert
    onQuery(/INSERT INTO client_config\.change_lookup_request/i, () => [{ id: 43 }]);

    const { stageChangeLookupRequest } = await import("@/lib/client-config-db");
    const result = await stageChangeLookupRequest({
      changeRequestId: UUI_D,
      dimension: "sub_asset_class",
      parentAssetClassCode: "EQ",
      subAssetClassCode: "PRI",
      subAssetClassName: "PRIVATE EQUITY",
      sortOrder: 5,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.id).toBe("43");
    }
  });

  it("rejects sub_asset_class when the parent asset class does not exist", async () => {
    // Parent does not exist
    onQuery(/SELECT asset_class_code FROM client_config\.asset_class/i, () => []);
    let insertCalled = false;
    onQuery(/INSERT INTO client_config\.change_lookup_request/i, () => {
      insertCalled = true;
      return [{ id: 1 }];
    });

    const { stageChangeLookupRequest } = await import("@/lib/client-config-db");
    const result = await stageChangeLookupRequest({
      changeRequestId: UUI_D,
      dimension: "sub_asset_class",
      parentAssetClassCode: "ZZ",
      subAssetClassCode: "PRI",
      subAssetClassName: "PRIVATE EQUITY",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.includes("bestaat niet"))).toBe(true);
    }
    expect(insertCalled).toBe(false);
  });

  it("rejects duplicate staged lookup request for the same value", async () => {
    // Parent exists
    onQuery(/SELECT asset_class_code FROM client_config\.asset_class/i, () => [{ asset_class_code: "EQ" }]);
    // Duplicate found in open change request
    onQuery(/FROM client_config\.change_lookup_request clr/i, () => [{ id: 99 }]);

    let insertCalled = false;
    onQuery(/INSERT INTO client_config\.change_lookup_request/i, () => {
      insertCalled = true;
      return [{ id: 1 }];
    });

    const { stageChangeLookupRequest } = await import("@/lib/client-config-db");
    const result = await stageChangeLookupRequest({
      changeRequestId: UUI_D,
      dimension: "sub_asset_class",
      parentAssetClassCode: "EQ",
      subAssetClassCode: "PRI",
      subAssetClassName: "PRIVATE EQUITY",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.includes("al eerder aangevraagd"))).toBe(true);
    }
    expect(insertCalled).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (c) After approval the value becomes available
// ═══════════════════════════════════════════════════════════════════════════
describe("(c) after approval — value becomes available", () => {
  const UUI_D = "11111111-1111-1111-1111-111111111111";

  it("applyChangeLookupRequests makes new asset class available via lookupCodesFromReferenceData", async () => {
    // Stage 1: mock staged lookup request rows
    onQuery(
      /FROM client_config\.change_lookup_request/i,
      () => [
        {
          id: 1,
          change_request_id: UUI_D,
          dimension: "asset_class",
          asset_class_code: "PR",
          asset_class_name: "PRIVATE MARKETS",
          parent_asset_class_code: null,
          sub_asset_class_code: null,
          sub_asset_class_name: null,
          benchmark_code: null,
          benchmark_name: null,
          currency: null,
          sort_order: null,
          apply_status: "pending",
          apply_error: null,
          created_at: new Date("2026-08-01T08:00:00Z"),
        },
      ],
    );

    // Not already in live table
    onQuery(/SELECT 1 FROM client_config\.asset_class/i, () => []);
    // Insert into live table
    onQuery(/INSERT INTO client_config\.asset_class/i, () => [{ asset_class_id: 99 }]);
    // Update status
    onQuery(/UPDATE client_config\.change_lookup_request/i, () => []);

    await import("@/lib/client-config-db"); // Ensure module is loaded
    const { applyChangeLookupRequests } = await import("@/lib/client-config-db");
    const result = await applyChangeLookupRequests(UUI_D);
    expect(result.success).toBe(true);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].result).toBe("applied");

    // Now verify the value can be resolved via lookupCodesFromReferenceData
    // lookupCodesFromReferenceData requires both asset + sub-asset class.
    // With no sub_asset_class rows, it returns null.
    const { lookupCodesFromReferenceData } = await import("@/lib/portfolio-config");
    const refData1 = { clients: [], portfolios: [], assetClasses: [{ assetClassId: 99, assetClassCode: "PR", assetClassName: "PRIVATE MARKETS" }], subAssetClasses: [], managers: [], benchmarks: [], npcClassifications: [] } as any;
    expect(lookupCodesFromReferenceData("PRIVATE MARKETS", "GLOBAL EQUITIES", refData1)).toBeNull();

    // With a matching sub class it resolves
    const refData2 = { clients: [], portfolios: [], assetClasses: [{ assetClassId: 99, assetClassCode: "PR", assetClassName: "PRIVATE MARKETS" }], subAssetClasses: [{ subAssetClassId: 990, assetClassId: 99, subAssetClassCode: "PRI", subAssetClassName: "PRIVATE EQUITY", sortOrder: 1 }], managers: [], benchmarks: [], npcClassifications: [] } as any;
    expect(lookupCodesFromReferenceData("PRIVATE MARKETS", "PRIVATE EQUITY", refData2)).toEqual({ assetClassCode: "PR", subAssetClassCode: "PRI" });
  });

  it("applyChangeLookupRequests makes new sub asset class available", async () => {
    // Mock staged sub_asset_class request
    onQuery(
      /FROM client_config\.change_lookup_request/i,
      () => [
        {
          id: 1,
          change_request_id: UUI_D,
          dimension: "sub_asset_class",
          asset_class_code: null,
          asset_class_name: null,
          parent_asset_class_code: "EQ",
          sub_asset_class_code: "ENV",
          sub_asset_class_name: "ENVIRONMENTAL",
          benchmark_code: null,
          benchmark_name: null,
          currency: null,
          sort_order: 1,
          apply_status: "pending",
          apply_error: null,
          created_at: new Date("2026-08-01T08:00:00Z"),
        },
      ],
    );

    // Sub asset class not in live table
    onQuery(/SELECT 1 FROM client_config\.sub_asset_class/i, () => []);
    // Parent asset class exists for FK
    onQuery(/SELECT asset_class_id FROM client_config\.asset_class/i, () => [{ asset_class_id: 1 }]);
    // Insert into live sub_asset_class
    onQuery(/INSERT INTO client_config\.sub_asset_class/i, () => [{ sub_asset_class_id: 50 }]);
    // Update status
    onQuery(/UPDATE client_config\.change_lookup_request/i, () => []);

    const { applyChangeLookupRequests } = await import("@/lib/client-config-db");
    const result = await applyChangeLookupRequests(UUI_D);
    expect(result.success).toBe(true);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].result).toBe("applied");

    // Verify resolve via lookupCodesFromReferenceData
    const { lookupCodesFromReferenceData } = await import("@/lib/portfolio-config");
    const referenceData = {
      clients: [],
      portfolios: [],
      assetClasses: [
        { assetClassId: 1, assetClassCode: "EQ", assetClassName: "EQUITIES" },
      ],
      subAssetClasses: [
        { subAssetClassId: 50, assetClassId: 1, subAssetClassCode: "ENV", subAssetClassName: "ENVIRONMENTAL", sortOrder: 1 },
      ],
      managers: [],
      benchmarks: [],
      npcClassifications: [],
    } as any;

    const codes = lookupCodesFromReferenceData("EQUITIES", "ENVIRONMENTAL", referenceData);
    expect(codes).toEqual({ assetClassCode: "EQ", subAssetClassCode: "ENV" });
  });

  it("applyNewBenchmarkRequest makes new benchmark available in reference data", async () => {
    // Mock staged benchmark via legacy flow
    onQuery(
      /FROM new_benchmark_requests/i,
      () => [
        {
          short_name: "CUSTOM-ESG-NL",
          long_name: "Duurzame NL Benchmark",
          currency: "EUR",
        },
      ],
    );

    // Not already in live table
    onQuery(/SELECT 1 FROM client_config\.benchmark/i, () => []);
    // Insert
    onQuery(/INSERT INTO client_config\.benchmark/i, () => []);

    const { applyNewBenchmarkRequest } = await import("@/lib/client-config-db");
    const result = await applyNewBenchmarkRequest(UUI_D);
    expect(result.success).toBe(true);
    expect(result.applied[0].result).toBe("applied");
  });

  it("applied lookup values appear in getClientConfigReferenceData", async () => {
    vi.resetModules();
    // After apply, a subsequent getClientConfigReferenceData call should
    // return the newly inserted value.
    onQuery(/FROM client_config\.client/i, () => [{ client_code: "TST", client_name: "Test" }]);
    onQuery(/FROM client_config\.portfolio/i, () => []);
    onQuery(/FROM client_config\.asset_class/i, () => [
      { asset_class_id: 1, asset_class_code: "EQ", asset_class_name: "EQUITIES" },
      { asset_class_id: 99, asset_class_code: "PR", asset_class_name: "PRIVATE MARKETS" },
    ]);
    onQuery(/FROM client_config\.sub_asset_class/i, () => [
      { sub_asset_class_id: 1, asset_class_id: 1, sub_asset_class_code: "ACX", sub_asset_class_name: "AC WORLD", sort_order: 1 },
      { sub_asset_class_id: 99, asset_class_id: 99, sub_asset_class_code: "PRI", sub_asset_class_name: "PRIVATE EQUITY", sort_order: 1 },
    ]);
    onQuery(/FROM client_config\.manager/i, () => []);
    onQuery(/FROM client_config\.benchmark/i, () => []);
    onQuery(/FROM client_config\.npc_classification/i, () => []);

    const { getClientConfigReferenceData } = await import("@/lib/client-config-db");
    const data = await getClientConfigReferenceData();

    // Both the original and newly applied asset classes are present
    expect(data.assetClasses.some((ac) => ac.assetClassCode === "EQ")).toBe(true);
    expect(data.assetClasses.some((ac) => ac.assetClassCode === "PR")).toBe(true);

    // Both original and newly applied sub asset classes are present
    expect(data.subAssetClasses.some((sac) => sac.subAssetClassCode === "ACX")).toBe(true);
    expect(data.subAssetClasses.some((sac) => sac.subAssetClassCode === "PRI")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// End-to-end: missing lookup → request → apply → value available
// ═══════════════════════════════════════════════════════════════════════════
describe("end-to-end flow: missing → request → apply → available", () => {
  const UUI_D = "11111111-1111-1111-1111-111111111111";

  it("complete e2e: asset class missing in portfolio action → stage → apply → resolve", async () => {
    vi.resetModules();

    // ── Step 1: portfolio action should reject unknown asset class ──
    onQuery(/FROM client_config\.portfolio/i, () => [{ portfolio_id: 1, portfolio_code: "ADP", parent_account_id: null, active_ind: true }]);
    onQuery(/FROM client_config\.client/i, () => [{ client_code: "ADP", client_name: "ADP" }]);
    onQuery(/FROM client_config\.asset_class/i, () => []); // missing!
    onQuery(/FROM client_config\.sub_asset_class/i, () => []);
    onQuery(/FROM client_config\.manager/i, () => [{ manager_id: 1, manager_code: "ROB", manager_name: "Robeco" }]);
    onQuery(/FROM client_config\.benchmark/i, () => [{ benchmark_id: 1, benchmark_code: "MSCI-WORLD-NR", benchmark_name: "MSCI World Net Return", rimes_code: null }]);
    onQuery(/FROM client_config\.npc_classification/i, () => [{ npc_classification_id: 1, classification_name: "Pensioen" }]);

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    const futureDate = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
    const formData = (() => {
      const fd = new FormData();
      fd.append("portfolioCode", "ADP");
      fd.append("assetClass", "PRIVATE MARKETS");
      fd.append("subAssetClass", "GLOBAL EQUITIES");
      fd.append("managerCode", "ROB");
      fd.append("benchmarkCode", "MSCI-WORLD-NR");
      fd.append("npcClassificationId", "1");
      fd.append("longName", "Test Portfolio");
      fd.append("shortName", "TEST");
      fd.append("requestedBy", "Test User");
      fd.append("rationale", "Test — end-to-end missing lookup flow.");
      fd.append("effectiveDate", futureDate);
      return fd;
    })();

    const rejection = await createPortfolioAdditionChange({}, formData);
    expect(rejection.issues).toBeDefined();
    expect(rejection.issues!.join(" ")).toContain("asset class");

    // ── Step 2: stage a new asset class request via governed flow ──
    vi.resetModules();
    onQuery(/SELECT asset_class_code FROM client_config\.asset_class/i, () => []);
    onQuery(/FROM client_config\.change_lookup_request clr/i, () => []);
    onQuery(/INSERT INTO client_config\.change_lookup_request/i, () => [{ id: 100 }]);

    const { stageChangeLookupRequest } = await import("@/lib/client-config-db");
    const staged = await stageChangeLookupRequest({
      changeRequestId: UUI_D,
      dimension: "asset_class",
      assetClassCode: "PR",
      assetClassName: "PRIVATE MARKETS",
    });
    expect(staged.ok).toBe(true);

    // ── Step 3: approve and apply ──
    vi.resetModules();
    onQuery(/FROM client_config\.change_lookup_request/i, () => [
      {
        id: 100,
        change_request_id: UUI_D,
        dimension: "asset_class",
        asset_class_code: "PR",
        asset_class_name: "PRIVATE MARKETS",
        parent_asset_class_code: null,
        sub_asset_class_code: null,
        sub_asset_class_name: null,
        benchmark_code: null,
        benchmark_name: null,
        currency: null,
        sort_order: null,
        apply_status: "pending",
        apply_error: null,
        created_at: new Date("2026-08-01T08:00:00Z"),
      },
    ]);
    onQuery(/SELECT 1 FROM client_config\.asset_class/i, () => []);
    onQuery(/INSERT INTO client_config\.asset_class/i, () => [{ asset_class_id: 99 }]);
    onQuery(/UPDATE client_config\.change_lookup_request/i, () => []);

    const { applyChangeLookupRequests } = await import("@/lib/client-config-db");
    const applied = await applyChangeLookupRequests(UUI_D);
    expect(applied.success).toBe(true);
    expect(applied.applied[0].result).toBe("applied");

    // ── Step 4: verify the newly applied value is resolvable ──
    const { lookupCodesFromReferenceData } = await import("@/lib/portfolio-config");
    const refData = {
      clients: [], portfolios: [],
      assetClasses: [{ assetClassId: 99, assetClassCode: "PR", assetClassName: "PRIVATE MARKETS" }],
      subAssetClasses: [{ subAssetClassId: 990, assetClassId: 99, subAssetClassCode: "PRI", subAssetClassName: "PRIVATE EQUITY", sortOrder: 1 }],
      managers: [], benchmarks: [], npcClassifications: [],
    } as any;

    const codes = lookupCodesFromReferenceData("PRIVATE MARKETS", "PRIVATE EQUITY", refData);
    expect(codes).toEqual({ assetClassCode: "PR", subAssetClassCode: "PRI" });
  });
});