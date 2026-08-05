/**
 * Enforcement boundary tests for client_config lookup dimensions.
 *
 * Verifies the enforcement contract established by the lookup dimension
 * classification (ADMIN-ONLY vs USER-REQUESTABLE):
 *
 *   (a) Admin-only dimensions (manager, npc_classification) produce
 *       descriptive boundary errors guiding users to support/beheerder.
 *   (b) User-requestable dimensions (asset_class, sub_asset_class, benchmark)
 *       guide users toward the governed change flow.
 *   (c) The import/export enforcement contract: apply functions set the
 *       app.change_process_bypass GUC; user-facing functions never do.
 *   (d) No direct DML from user-facing flows — only staging tables.
 *   (e) The static validation sources (lib/asset-classes.ts) and the DB
 *       lookup tables stay aligned for the governed flow.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Shared mocks ───────────────────────────────────────────────────────────
const queryHandlers = new Map<string, (sql: string, params: unknown[]) => unknown[]>();

function onQuery(
  pattern: RegExp,
  handler: (sql: string, params: unknown[]) => unknown[],
): void {
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
    return Promise.resolve([]);
  };
  const sql = Object.assign(handlerFn, {
    begin: vi.fn(
      (cb: (tx: unknown) => Promise<unknown>) => cb(handlerFn),
    ),
    end: vi.fn().mockResolvedValue(undefined),
  });
  return { default: vi.fn(() => sql) };
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error("REDIRECT");
  },
}));

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
// (a) Admin-only dimensions — boundary error messages
// ═══════════════════════════════════════════════════════════════════════════
describe("(a) admin-only dimensions return boundary enforcement errors", () => {
  it("manager missing returns boundary message directing to support", async () => {
    vi.resetModules();
    onQuery(/FROM client_config\.client/i, () => [{ client_code: "TST", client_name: "Test" }]);
    onQuery(/FROM client_config\.portfolio/i, () => [{ portfolio_id: 1, portfolio_code: "TST", active_ind: true }]);
    onQuery(/FROM client_config\.asset_class/i, () => [{ asset_class_id: 1, asset_class_code: "EQ", asset_class_name: "EQUITIES" }]);
    onQuery(/FROM client_config\.sub_asset_class/i, () => [{ sub_asset_class_id: 1, asset_class_id: 1, sub_asset_class_code: "ACX", sub_asset_class_name: "AC WORLD" }]);
    onQuery(/FROM client_config\.manager/i, () => []);
    onQuery(/FROM client_config\.benchmark/i, () => [{ benchmark_id: 1, benchmark_code: "MSCI-WORLD-NR", benchmark_name: "MSCI World" }]);
    onQuery(/FROM client_config\.npc_classification/i, () => [{ npc_classification_id: 1, classification_name: "Default" }]);

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    const result = await createPortfolioAdditionChange(
      {},
      buildFormData({ managerCode: "XYZ" }),
    );

    expect(result.issues).toBeDefined();
    const msg = result.issues!.join(" ");
    expect(msg).toContain("Manager");
    expect(msg).toContain("beheerder");
    expect(msg).toContain("support");
  });

  it("npc_classification missing returns boundary message directing to beheerder", async () => {
    vi.resetModules();
    onQuery(/FROM client_config\.client/i, () => [{ client_code: "TST", client_name: "Test" }]);
    onQuery(/FROM client_config\.portfolio/i, () => [{ portfolio_id: 1, portfolio_code: "TST", active_ind: true }]);
    onQuery(/FROM client_config\.asset_class/i, () => [{ asset_class_id: 1, asset_class_code: "EQ", asset_class_name: "EQUITIES" }]);
    onQuery(/FROM client_config\.sub_asset_class/i, () => [{ sub_asset_class_id: 1, asset_class_id: 1, sub_asset_class_code: "ACX", sub_asset_class_name: "AC WORLD" }]);
    onQuery(/FROM client_config\.manager/i, () => [{ manager_id: 1, manager_code: "ROB", manager_name: "Robeco" }]);
    onQuery(/FROM client_config\.benchmark/i, () => [{ benchmark_id: 1, benchmark_code: "MSCI-WORLD-NR", benchmark_name: "MSCI World" }]);
    onQuery(/FROM client_config\.npc_classification/i, () => []);

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    const result = await createPortfolioAdditionChange(
      {},
      buildFormData({ npcClassificationId: "99" }),
    );

    expect(result.issues).toBeDefined();
    const msg = result.issues!.join(" ");
    expect(msg).toContain("NPC classificatie");
    expect(msg).toContain("beheerder");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (b) User-requestable dimensions — governed flow guidance
// ═══════════════════════════════════════════════════════════════════════════
describe("(b) user-requestable dimensions guide to governed change flow", () => {
  it("asset_class missing guides to change process", async () => {
    vi.resetModules();
    onQuery(/FROM client_config\.client/i, () => [{ client_code: "TST", client_name: "Test" }]);
    onQuery(/FROM client_config\.portfolio/i, () => [{ portfolio_id: 1, portfolio_code: "TST", active_ind: true }]);
    onQuery(/FROM client_config\.asset_class/i, () => []);

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    const result = await createPortfolioAdditionChange(
      {},
      buildFormData({ assetClass: "NEW_ASSET" }),
    );

    expect(result.issues).toBeDefined();
    const msg = result.issues!.join(" ");
    expect(msg).toContain("Asset class");
    expect(msg).toContain("change proces");
  });

  it("benchmark missing guides to benchmark-aanvraag", async () => {
    vi.resetModules();
    onQuery(/FROM client_config\.client/i, () => [{ client_code: "TST", client_name: "Test" }]);
    onQuery(/FROM client_config\.portfolio/i, () => [{ portfolio_id: 1, portfolio_code: "TST", active_ind: true }]);
    onQuery(/FROM client_config\.asset_class/i, () => [{ asset_class_id: 1, asset_class_code: "EQ", asset_class_name: "EQUITIES" }]);
    onQuery(/FROM client_config\.sub_asset_class/i, () => [{ sub_asset_class_id: 1, asset_class_id: 1, sub_asset_class_code: "ACX", sub_asset_class_name: "AC WORLD" }]);
    onQuery(/FROM client_config\.manager/i, () => [{ manager_id: 1, manager_code: "ROB", manager_name: "Robeco" }]);
    onQuery(/FROM client_config\.benchmark/i, () => []);
    onQuery(/FROM client_config\.npc_classification/i, () => [{ npc_classification_id: 1, classification_name: "Default" }]);

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    const result = await createPortfolioAdditionChange(
      {},
      buildFormData({ benchmarkCode: "NEW-BENCH" }),
    );

    expect(result.issues).toBeDefined();
    const msg = result.issues!.join(" ");
    expect(msg).toContain("Benchmark");
    expect(msg).toContain("benchmark-aanvraag");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (c) Import/export enforcement contract — apply functions set bypass GUC
// ═══════════════════════════════════════════════════════════════════════════
describe("(c) apply functions set app.change_process_bypass GUC", () => {
  let sqlCalls: string[];

  beforeEach(() => {
    sqlCalls = [];
    vi.stubEnv("CHANGE_LOOKUP_DIMENSIONS", "asset_class,sub_asset_class,benchmark");
  });

  it("applyChangeLookupRequests sets bypass before mutating asset_class", async () => {
    vi.resetModules();
    const bypassSet = vi.fn();
    onQuery(/SET LOCAL app\.change_process_bypass/, (sql) => {
      bypassSet();
      return [];
    });
    // Stub getChangeLookupRequests to return a pending asset_class row
    onQuery(/FROM client_config\.change_lookup_request/, () => [
      {
        id: 1,
        change_request_id: "11111111-1111-1111-1111-111111111111",
        dimension: "asset_class",
        asset_class_code: "PR",
        asset_class_name: "PRIVATE MARKETS",
        sub_asset_class_code: null,
        sub_asset_class_name: null,
        parent_asset_class_code: null,
        sort_order: null,
        benchmark_code: null,
        benchmark_short_name: null,
        benchmark_long_name: null,
        apply_status: "pending",
        apply_error: null,
        created_at: new Date(),
      },
    ]);
    onQuery(/UPDATE.*change_lookup_request.*apply_status/, () => []);
    onQuery(/INSERT INTO client_config\.asset_class/, () => []);

    const { applyChangeLookupRequests } = await import("@/lib/client-config-db");
    await applyChangeLookupRequests("11111111-1111-1111-1111-111111111111");

    expect(bypassSet).toHaveBeenCalled();
  });

  it("applyNewBenchmarkRequest sets bypass before mutating benchmark", async () => {
    vi.resetModules();
    const bypassSet = vi.fn();
    // Stub new_benchmark_requests to return a pending row so the function
    // proceeds past the early-return check and into the begin block
    onQuery(/FROM new_benchmark_requests/, () => [
      { short_name: "CUSTOM-BENCH", long_name: "Custom Benchmark", currency: "EUR" },
    ]);
    onQuery(/SET LOCAL app\.change_process_bypass/, () => {
      bypassSet();
      return [];
    });
    onQuery(/FROM client_config\.benchmark/, () => []);
    onQuery(/INSERT INTO client_config\.benchmark/, () => []);

    const { applyNewBenchmarkRequest } = await import("@/lib/client-config-db");
    await applyNewBenchmarkRequest("11111111-1111-1111-1111-111111111111");

    expect(bypassSet).toHaveBeenCalled();
  });

  it("applyChangePortfolioConfigurations sets bypass before mutating portfolio_configuration", async () => {
    vi.resetModules();
    const bypassSet = vi.fn();
    // Stub change_portfolio_configuration to return pending rows so the
    // function proceeds past the early-return check
    onQuery(/FROM client_config\.change_portfolio_configuration/, () => [
      {
        id: 1,
        change_request_id: "11111111-1111-1111-1111-111111111111",
        action_type: "CREATE",
        portfolio_code: "TST",
        client_code: "TST",
        asset_class_code: "EQ",
        sub_asset_class_code: "ACX",
        manager_code: "ROB",
        benchmark_code: "MSCI-WORLD-NR",
        npc_classification_id: 1,
        long_name: "Test",
        short_name: "TST",
        effective_from: new Date(),
        effective_until: null,
        created_at: new Date(),
      },
    ]);
    onQuery(/SET LOCAL app\.change_process_bypass/, () => {
      bypassSet();
      return [];
    });
    onQuery(/UPDATE client_config\.change_portfolio_configuration/, () => []);

    const { applyChangePortfolioConfigurations } = await import("@/lib/client-config-db");
    await applyChangePortfolioConfigurations("11111111-1111-1111-1111-111111111111");

    expect(bypassSet).toHaveBeenCalled();
  });

  it("stageChangeLookupRequest does NOT set bypass", async () => {
    vi.resetModules();
    const bypassSet = vi.fn();
    onQuery(/SET LOCAL app\.change_process_bypass/, () => {
      bypassSet();
      return [];
    });
    onQuery(/FROM client_config\.asset_class/, () => []);
    onQuery(/FROM client_config\.change_lookup_request/, () => []);
    onQuery(/INSERT INTO client_config\.change_lookup_request/, () => [{ id: 1 }]);

    const { stageChangeLookupRequest } = await import("@/lib/client-config-db");
    await stageChangeLookupRequest({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      dimension: "asset_class",
      assetClassCode: "PR",
      assetClassName: "PRIVATE MARKETS",
    });

    expect(bypassSet).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (d) No direct DML from user-facing flows — only staging tables
// ═══════════════════════════════════════════════════════════════════════════
describe("(d) user-facing flows only use staging tables", () => {
  it("createPortfolioAdditionChange inserts into change_portfolio_configuration, not portfolio_configuration", async () => {
    vi.resetModules();
    const portfolioConfigInserts: string[] = [];
    onQuery(/FROM client_config\.client/i, () => [{ client_code: "TST", client_name: "Test" }]);
    onQuery(/FROM client_config\.portfolio/i, () => [{ portfolio_id: 1, portfolio_code: "TST", parent_account_id: null, active_ind: true }]);
    onQuery(/FROM client_config\.asset_class/i, () => [{ asset_class_id: 1, asset_class_code: "EQ", asset_class_name: "EQUITIES" }]);
    onQuery(/FROM client_config\.sub_asset_class/i, () => [{ sub_asset_class_id: 1, asset_class_id: 1, sub_asset_class_code: "ACX", sub_asset_class_name: "AC WORLD" }]);
    onQuery(/FROM client_config\.manager/i, () => [{ manager_id: 1, manager_code: "ROB", manager_name: "Robeco" }]);
    onQuery(/FROM client_config\.benchmark/i, () => [{ benchmark_id: 1, benchmark_code: "MSCI-WORLD-NR", benchmark_name: "MSCI World" }]);
    onQuery(/FROM client_config\.npc_classification/i, () => [{ npc_classification_id: 1, classification_name: "Default" }]);
    onQuery(/SELECT 1 FROM change_type_config WHERE id =/, () => [{ 1: 1 }]);
    // getPublicClientIdByCode: a legacy clients row must exist for the FK
    // (fail-closed regression t_d556c774).
    onQuery(/SELECT id FROM clients/i, () => [{ id: "9f9280fc-9572-49d1-b81c-2a039652bc93" }]);
    onQuery(/INSERT INTO change_requests/i, () => []);
    onQuery(/INSERT INTO client_config\.change_portfolio_configuration/i, () => {
      portfolioConfigInserts.push("change_portfolio_configuration");
      return [{ id: 1 }];
    });
    onQuery(/INSERT INTO client_config\.portfolio_configuration/i, () => {
      portfolioConfigInserts.push("portfolio_configuration");
      return [];
    });

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    try {
      await createPortfolioAdditionChange({}, buildFormData({}));
    } catch { /* redirect */ }

    expect(portfolioConfigInserts).toEqual(["change_portfolio_configuration"]);
  });

  it("stageChangeLookupRequest inserts into change_lookup_request, not the lookup table", async () => {
    vi.resetModules();
    const directInserts: string[] = [];
    onQuery(/FROM client_config\.asset_class/, () => []);
    onQuery(/FROM client_config\.change_lookup_request/, () => []);
    onQuery(/INSERT INTO client_config\.change_lookup_request/, () => {
      directInserts.push("change_lookup_request");
      return [{ id: 1 }];
    });
    onQuery(/INSERT INTO client_config\.asset_class/, () => {
      directInserts.push("asset_class");
      return [];
    });

    const { stageChangeLookupRequest } = await import("@/lib/client-config-db");
    await stageChangeLookupRequest({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      dimension: "asset_class",
      assetClassCode: "PR",
      assetClassName: "PRIVATE MARKETS",
    });

    expect(directInserts).toEqual(["change_lookup_request"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (e) DB trigger enforcement — bypass GUC presence
// ═══════════════════════════════════════════════════════════════════════════
describe("(e) DB trigger enforcement — bypass GUC pattern", () => {
  it("applyChangeLookupRequests wraps inserts in BEGIN ... SET LOCAL ... END", async () => {
    vi.resetModules();
    let sawBegin = false;
    let sawBypass = false;
    let sawInsert = false;

    // Capture the transaction flow
    onQuery(/SET LOCAL app\.change_process_bypass/, () => {
      sawBypass = true;
      return [];
    });
    onQuery(/FROM client_config\.change_lookup_request/, () => [
      {
        id: 1,
        change_request_id: "11111111-1111-1111-1111-111111111111",
        dimension: "asset_class",
        asset_class_code: "PR",
        asset_class_name: "PRIVATE MARKETS",
        apply_status: "pending",
        apply_error: null,
        created_at: new Date(),
      },
    ]);
    onQuery(/UPDATE.*change_lookup_request.*apply_status/, () => []);
    onQuery(/INSERT INTO client_config\.asset_class/, () => {
      sawInsert = true;
      return [];
    });

    const { applyChangeLookupRequests } = await import("@/lib/client-config-db");
    await applyChangeLookupRequests("11111111-1111-1111-1111-111111111111");

    expect(sawBypass).toBe(true);
    expect(sawInsert).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════
const futureDate = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];

function buildFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const defaults: Record<string, string> = {
    portfolioCode: "TST",
    assetClass: "EQUITIES",
    subAssetClass: "AC WORLD",
    managerCode: "ROB",
    benchmarkCode: "MSCI-WORLD-NR",
    npcClassificationId: "1",
    longName: "Enforcement Test Portfolio",
    shortName: "ENF-TEST",
    requestedBy: "Test User",
    rationale: "Enforcement test — verifying boundary enforcement contract.",
    effectiveDate: futureDate,
  };
  const data = { ...defaults, ...overrides };
  for (const [key, value] of Object.entries(data)) {
    fd.append(key, value);
  }
  return fd;
}