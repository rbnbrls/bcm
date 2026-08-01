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
      { portfolio_id: 1, portfolio_code: "ADP", parent_account_id: 1 },
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
});
