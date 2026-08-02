/**
 * Integration tests for the normalized portfolio addition server action
 * (createPortfolioAdditionChange).
 *
 * Tests the full data pipeline: form data input → Zod validation →
 * change type config lookup → reference data validation → field value
 * construction → cost computation → save to DB.
 * Uses mocked DB layer so tests run without a real database.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ClientConfig, ClientConfigAssetClass, ClientConfigSubAssetClass, ClientConfigManager, ClientConfigBenchmark, ClientConfigNpcClassification } from "@/lib/types";

// ── Postgres mock (same pattern as portfolio-addition.test.ts) ─────────────
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
describe("createPortfolioAdditionChange server action", () => {
  const futureDate = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];

  /**
   * Create a FormData object with ALL valid normalized portfolio addition fields.
   */
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
   * Stub the DB queries needed for a successful flow against the normalized schema.
   */
  function stubDbForSuccess() {
    // getClientConfigReferenceData queries
    onQuery(/FROM client_config\.client/i, () => [
      { client_code: "ADP", client_name: "ADP" },
    ]);
    onQuery(/FROM client_config\.portfolio/i, () => [
      { portfolio_id: 1, portfolio_code: "ADP", parent_account_id: 1, active_ind: true },
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

    // getChangeTypeBySlug: falls back to DEFAULT when DB returns []
    // changeTypeId existence check — this ID matches the default portfolio_addition
    onQuery(/SELECT 1 FROM change_type_config WHERE id =/, () => [{ 1: 1 }]);
    // saveChangeRequest: INSERT INTO change_requests
    onQuery(/INSERT INTO change_requests/i, () => []);

    // saveChangePortfolioConfiguration: INSERT INTO change_portfolio_configuration
    onQuery(/INSERT INTO client_config\.change_portfolio_configuration/i, () => [{ id: 1 }]);
  }

  it("returns validation errors for empty required fields", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    const result = await createPortfolioAdditionChange({}, buildMockFormData({
      portfolioCode: "", assetClass: "", subAssetClass: "", managerCode: "",
      benchmarkCode: "", npcClassificationId: "", longName: "", shortName: "",
      requestedBy: "", rationale: "", effectiveDate: "",
    }));

    expect(result.issues).toBeDefined();
    expect(result.issues!.length).toBeGreaterThan(0);
    const allErrors = result.issues!.join(" ");
    expect(allErrors).toContain("Portfolio code");
    expect(allErrors).toContain("Manager code");
  });

  it("rejects effective date in the past", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    const result = await createPortfolioAdditionChange({}, validFormData({ effectiveDate: "2020-01-01" }));

    expect(result.issues).toBeDefined();
    expect(result.issues!.join(" ")).toContain("verleden");
  });

  it("returns error when change type config is not found", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    // Force the issue by making the DB query throw.
    onQuery(/SELECT \* FROM change_type_config/i, () => {
      throw new Error("Table does not exist");
    });

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    const result = await createPortfolioAdditionChange({}, validFormData());

    expect(result.issues).toBeDefined();
    const msg = result.issues!.join(" ");
    expect(msg).toContain("bestaat niet");
  });

  it("returns error when portfolio code does not exist in reference data", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    onQuery(/FROM client_config\.portfolio/i, () => []);

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    const result = await createPortfolioAdditionChange({}, validFormData());

    expect(result.issues).toBeDefined();
    const msg = result.issues!.join(" ");
    expect(msg).toContain("portfolio code");
    expect(msg).toContain("bestaat niet");
  });

  it("successfully creates a change request and redirects", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    stubDbForSuccess();
    mockRedirect.mockClear();

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");

    try {
      await createPortfolioAdditionChange({}, validFormData());
    } catch (e) {
      // Expected — redirect throws
    }

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    const redirectUrl = String(mockRedirect.mock.calls[0][0]);
    expect(redirectUrl).toMatch(/^\/changes\/[0-9a-f-]+$/);
  });

  it("rejects long name longer than 255 characters", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    const result = await createPortfolioAdditionChange({}, validFormData({ longName: "X".repeat(256) }));

    expect(result.issues).toBeDefined();
    expect(result.issues!.join(" ")).toContain("255");
  });

  it("rejects rationale shorter than 10 characters", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    const result = await createPortfolioAdditionChange({}, validFormData({ rationale: "Short" }));

    expect(result.issues).toBeDefined();
    expect(result.issues!.join(" ")).toContain("minimaal");
  });

  it("builds IST/SOLL field pairs mapping normalized form fields correctly", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    stubDbForSuccess();
    mockRedirect.mockClear();

    let savedFields: string | null = null;
    onQuery(/INSERT INTO change_requests/i, (_sql, params) => {
      for (const p of params) {
        if (typeof p === "string" && p.includes('"fieldKey"')) {
          savedFields = p;
        }
      }
      return [];
    });

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    try {
      await createPortfolioAdditionChange({}, validFormData());
    } catch { /* redirect throw */ }

    expect(mockRedirect).toHaveBeenCalledTimes(1);

    if (savedFields) {
      const parsed = JSON.parse(savedFields);
      expect(parsed).toBeInstanceOf(Array);
      expect(parsed.length).toBe(10);
      const keys = parsed.map((f: any) => f.fieldKey);
      expect(keys).toContain("client_code");
      expect(keys).toContain("portfolio_code");
      expect(keys).toContain("asset_class_code");
      expect(keys).toContain("sub_asset_class_code");
      expect(keys).toContain("manager_code");
      expect(keys).toContain("benchmark_code");
      expect(keys).toContain("npc_classification_id");
      expect(keys).toContain("long_name");
      expect(keys).toContain("short_name");
      expect(keys).toContain("primary_account_id");
    }
  });

  // ── Backward compat: change-type slug tests ────────────────────────────
  it("stores the legacy portfolio_addition slug when the form does not send a changeTypeSlug (backward compat)", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    stubDbForSuccess();
    mockRedirect.mockClear();

    let savedChangeType: string | null = null;
    let savedChangeTypeId: string | null = null;
    onQuery(/INSERT INTO change_requests/i, (_sql, params) => {
      for (const p of params) {
        if (typeof p === "string" && p === "portfolio_addition") savedChangeType = p;
        if (typeof p === "string" && p === "a0000000-0000-0000-0000-000000000008") savedChangeTypeId = p;
      }
      return [];
    });

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    try {
      await createPortfolioAdditionChange({}, validFormData());
    } catch { /* redirect throw */ }

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    expect(savedChangeType).toBe("portfolio_addition");
    expect(savedChangeTypeId).toBe("a0000000-0000-0000-0000-000000000008");
  });

  it("stages under portfolio_configuration_create now that it is seeded in the default catalog", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    stubDbForSuccess();
    mockRedirect.mockClear();

    let savedChangeType: string | null = null;
    onQuery(/INSERT INTO change_requests/i, (_sql, params) => {
      for (const p of params) {
        if (typeof p === "string" && p === "portfolio_configuration_create") savedChangeType = p;
      }
      return [];
    });

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    try {
      await createPortfolioAdditionChange({}, validFormData({ changeTypeSlug: "portfolio_configuration_create" }));
    } catch { /* redirect throw */ }

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    // The explicit create slug resolves via the default catalog — the
    // documented auto-switch once seeding lands.
    expect(savedChangeType).toBe("portfolio_configuration_create");
  });

  // ════════════════════════════════════════════════════════════════════════
  // Server-side validation against reference data (create flow)
  // ════════════════════════════════════════════════════════════════════════

  it("accepts an explicit client code that exists in reference data", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    stubDbForSuccess();
    mockRedirect.mockClear();

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    try {
      await createPortfolioAdditionChange({}, validFormData({ clientCode: "ADP" }));
    } catch { /* redirect throw */ }

    expect(mockRedirect).toHaveBeenCalledTimes(1);
  });

  it("derives the client from the portfolio code prefix when no explicit client is submitted", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    stubDbForSuccess();

    // Override client/portfolio reference data so only HOR / HORRP exist.
    onQuery(/FROM client_config\.client/i, () => [
      { client_code: "HOR", client_name: "Pensioenfonds Horizon" },
    ]);
    onQuery(/FROM client_config\.portfolio/i, () => [
      { portfolio_id: 1, portfolio_code: "HORRP", parent_account_id: 1, active_ind: true },
    ]);
    mockRedirect.mockClear();

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    try {
      await createPortfolioAdditionChange({}, validFormData({ portfolioCode: "HORRP" }));
    } catch { /* redirect throw */ }

    expect(mockRedirect).toHaveBeenCalledTimes(1);
  });

  it("rejects an explicit client code that does not exist in reference data", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    const result = await createPortfolioAdditionChange({}, validFormData({ clientCode: "XXX" }));

    expect(result.issues).toBeDefined();
    const msg = result.issues!.join(" ");
    expect(msg).toContain('Client "XXX" bestaat niet in de referentiedata.');
  });

  it("rejects a portfolio that does not belong to the selected client", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    onQuery(/FROM client_config\.client/i, () => [
      { client_code: "HOR", client_name: "Pensioenfonds Horizon" },
      { client_code: "ZEK", client_name: "Stichting Pensioen Zeker" },
    ]);
    onQuery(/FROM client_config\.portfolio/i, () => [
      { portfolio_id: 1, portfolio_code: "HORRP", parent_account_id: 1, active_ind: true },
      { portfolio_id: 3, portfolio_code: "ZEKRET", parent_account_id: 2, active_ind: true },
    ]);

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    const result = await createPortfolioAdditionChange(
      {},
      validFormData({ clientCode: "ZEK", portfolioCode: "HORRP" }),
    );

    expect(result.issues).toBeDefined();
    const msg = result.issues!.join(" ");
    expect(msg).toContain('Portfolio "HORRP" hoort niet bij client "ZEK".');
  });

  it("rejects an inactive portfolio", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    onQuery(/FROM client_config\.client/i, () => [
      { client_code: "ADP", client_name: "ADP" },
    ]);
    onQuery(/FROM client_config\.portfolio/i, () => [
      { portfolio_id: 1, portfolio_code: "ADP", parent_account_id: 1, active_ind: false },
    ]);

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    const result = await createPortfolioAdditionChange({}, validFormData());

    expect(result.issues).toBeDefined();
    const msg = result.issues!.join(" ");
    expect(msg).toContain('Portfolio "ADP" is niet actief.');
  });

  it("rejects an unknown manager code against reference data", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    const result = await createPortfolioAdditionChange({}, validFormData({ managerCode: "ZZZ" }));

    expect(result.issues).toBeDefined();
    const msg = result.issues!.join(" ");
    expect(msg).toContain('Manager "ZZZ" bestaat niet in de referentiedata.');
  });

  it("rejects an unknown benchmark code against the catalog", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    const result = await createPortfolioAdditionChange({}, validFormData({ benchmarkCode: "NOT-A-BENCHMARK" }));

    expect(result.issues).toBeDefined();
    const msg = result.issues!.join(" ");
    expect(msg).toContain('Benchmark "NOT-A-BENCHMARK" bestaat niet in de catalogus.');
  });

  it("rejects an unknown NPC classification id", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    const result = await createPortfolioAdditionChange({}, validFormData({ npcClassificationId: "999" }));

    expect(result.issues).toBeDefined();
    const msg = result.issues!.join(" ");
    expect(msg).toContain("NPC classificatie met ID 999 bestaat niet.");
  });

  it("rejects a sub asset class that does not belong to the selected asset class", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    onQuery(/FROM client_config\.asset_class/i, () => [
      { asset_class_id: 1, asset_class_code: "EQ", asset_class_name: "EQUITIES" },
    ]);
    onQuery(/FROM client_config\.sub_asset_class/i, () => [
      { sub_asset_class_id: 1, asset_class_id: 1, sub_asset_class_code: "ACX", sub_asset_class_name: "AC WORLD" },
    ]);

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    const result = await createPortfolioAdditionChange({}, validFormData({ subAssetClass: "PRIVATE EQUITY" }));

    expect(result.issues).toBeDefined();
    const msg = result.issues!.join(" ");
    expect(msg).toContain("De gekozen sub asset class hoort niet bij de geselecteerde asset class.");
  });

  // ════════════════════════════════════════════════════════════════════════
  // Staging the CREATE row in change_portfolio_configuration
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Capture the INSERT parameters for change_portfolio_configuration.
   * Param order follows saveChangePortfolioConfiguration:
   *   [0] changeRequestId, [1] actionType, [2] targetPrimaryAccountId,
   *   [3] clientCode, [4] portfolioCode, [5] assetClassCode,
   *   [6] subAssetClassCode, [7] managerCode, [8] benchmarkCode,
   *   [9] npcClassificationId, [10] longName, [11] shortName,
   *   [12] effectiveFrom, [13] effectiveUntil
   *
   * Returns getters (not values) so the captured data can be read after the
   * server action has run.
   */
  function captureStagedCreateInsert(): {
    getStagedParams: () => unknown[] | null;
    getChangeRequestId: () => unknown;
  } {
    let stagedParams: unknown[] | null = null;
    let changeRequestId: unknown = null;
    onQuery(/INSERT INTO change_requests/i, (_sql, params) => {
      changeRequestId = params[0]; // saveChangeRequest: first param is the change request id
      return [];
    });
    onQuery(/INSERT INTO client_config\.change_portfolio_configuration/i, (_sql, params) => {
      stagedParams = params;
      return [{ id: 1 }];
    });
    return {
      getStagedParams: () => stagedParams,
      getChangeRequestId: () => changeRequestId,
    };
  }

  it("stages a CREATE row in change_portfolio_configuration with all new values, linked to the change request", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    stubDbForSuccess();
    mockRedirect.mockClear();

    const { getStagedParams, getChangeRequestId } = captureStagedCreateInsert();

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    try {
      await createPortfolioAdditionChange({}, validFormData());
    } catch { /* redirect throw */ }

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    const changeRequestId = getChangeRequestId();
    const stagedParams = getStagedParams();
    expect(changeRequestId).not.toBeNull();
    expect(stagedParams).not.toBeNull();
    if (!stagedParams) return;

    // The staged row must be linked to the just-created change request.
    expect(stagedParams[0]).toBe(changeRequestId);

    // CREATE semantics: action type CREATE, no target row.
    expect(stagedParams[1]).toBe("CREATE");
    expect(stagedParams[2]).toBeNull();

    // All new values — the SOLL side of the diff the change request displays.
    expect(stagedParams[3]).toBe("ADP");               // client_code
    expect(stagedParams[4]).toBe("ADP");               // portfolio_code
    expect(stagedParams[5]).toBe("EQ");                // asset_class_code
    expect(stagedParams[6]).toBe("ACX");               // sub_asset_class_code
    expect(stagedParams[7]).toBe("ROB");               // manager_code
    expect(stagedParams[8]).toBe("MSCI-WORLD-NR");     // benchmark_code
    expect(stagedParams[9]).toBe(1);                   // npc_classification_id
    expect(stagedParams[10]).toBe("E2E Test Portfolio"); // long_name
    expect(stagedParams[11]).toBe("E2E-TEST");         // short_name
    expect(stagedParams[12]).toBe(futureDate);         // effective_from
    expect(stagedParams[13]).toBeNull();               // effective_until (open-ended)
  });

  it("stages the CREATE row under the explicitly selected client code", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    stubDbForSuccess();
    mockRedirect.mockClear();

    const { getStagedParams } = captureStagedCreateInsert();

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    try {
      await createPortfolioAdditionChange({}, validFormData({ clientCode: "ADP" }));
    } catch { /* redirect throw */ }

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    const stagedParams = getStagedParams();
    expect(stagedParams).not.toBeNull();
    if (!stagedParams) return;
    expect(stagedParams[1]).toBe("CREATE");
    expect(stagedParams[3]).toBe("ADP"); // explicit client selection wins
  });

  it("does not stage a row when reference data validation fails", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    stubDbForSuccess();
    let stagedInsertCalled = false;
    onQuery(/INSERT INTO client_config\.change_portfolio_configuration/i, () => {
      stagedInsertCalled = true;
      return [{ id: 1 }];
    });

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    const result = await createPortfolioAdditionChange({}, validFormData({ managerCode: "ZZZ" }));

    expect(result.issues).toBeDefined();
    expect(stagedInsertCalled).toBe(false);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});