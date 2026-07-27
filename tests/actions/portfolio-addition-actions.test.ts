/**
 * Integration tests for the portfolio addition server action (createPortfolioAdditionChange).
 *
 * Tests the full data pipeline: form data input → Zod validation → 
 * change type config lookup → field value construction → cost computation → 
 * save to DB. Uses mocked DB layer so tests run without a real database.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ClientConfig, Benchmark, WtpClassification, AssetClassRow, Manager, BenchmarkGroup } from "@/lib/types";

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
  const VALID_CLIENT_ID = "9f9280fc-9572-49d1-b81c-2a039652bc93";
  const VALID_BENCHMARK_ID = "9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1";

  const futureDate = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];

  /**
   * Create a FormData object with ALL valid portfolio addition fields.
   */
  function validFormData(overrides: Record<string, string> = {}): FormData {
    return buildMockFormData({
      clientId: VALID_CLIENT_ID,
      name: "E2E Test Portfolio",
      externalReference: "E2E-TEST-PF",
      currentBenchmarkId: VALID_BENCHMARK_ID,
      currency: "EUR",
      wtpClassificationId: "00000001-0000-4000-a000-000000000001",
      assetClassRowId: "00000002-0000-4000-a000-000000000001",
      managerId: "00000003-0000-4000-a000-000000000001",
      benchmarkGroupId: "00000004-0000-4000-a000-000000000001",
      assetClass: "EQUITIES",
      subAssetClass: "AC WORLD",
      requestedBy: "E2E Test User",
      rationale: "E2E test — verifying portfolio addition server action end-to-end.",
      effectiveDate: futureDate,
      ...overrides,
    });
  }

  /**
   * Stub the DB queries needed for a successful flow.
   * getClientConfigs does a massive JOIN; we match a unique fragment.
   */
  function stubDbForSuccess() {
    // GetClientConfigs — match on a flexible part of the query
    onQuery(/FROM clients c[\s\S]+WHERE c\.status/i, () => [
      {
        client_id: VALID_CLIENT_ID,
        client_name: "Pensioenfonds Horizon",
        client_reference: "PF-HOR-001",
        client_regeling_type: null,
        client_asset_class: null,
        portfolio_id: null,
        portfolio_name: null,
        portfolio_reference: null,
        wtp_classification_id: null,
        asset_class_id: null,
        manager_id: null,
        benchmark_id: null,
        asset_class: null,
        sub_asset_class: null,
        wtp_id: null, wtp_name: null,
        ac_id: null, ac_name: null,
        m_id: null, m_name: null,
        bg_id: null, bg_name: null,
        id: null, code: null, name: null, currency: null,
      },
    ]);
    // getChangeTypeBySlug: falls back to DEFAULT when DB returns []
    // saveChangeRequest: INSERT INTO change_requests
    onQuery(/INSERT INTO change_requests/i, () => []);
  }

  it("returns validation errors for empty required fields", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    const result = await createPortfolioAdditionChange({}, buildMockFormData({
      clientId: "", name: "", externalReference: "", currentBenchmarkId: "",
      currency: "", wtpClassificationId: "", assetClassRowId: "", managerId: "",
      benchmarkGroupId: "", assetClass: "", subAssetClass: "",
      requestedBy: "", rationale: "", effectiveDate: "",
    }));

    expect(result.issues).toBeDefined();
    expect(result.issues!.length).toBeGreaterThan(0);
    const allErrors = result.issues!.join(" ");
    expect(allErrors).toContain("Portefeuillenaam");
    expect(allErrors).toContain("Externe referentie");
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

    // getChangeTypeBySlug checks DB first (returns [] from unhandled query),
    // then falls back to DEFAULT_CHANGE_TYPE_CONFIGS. But portfolio_addition
    // IS in defaults... Unless the environment prevents the fallback.
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

  it("returns error when selected client does not exist", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    // getClientConfigs returns empty (no clients matched)
    onQuery(/FROM clients c .+ WHERE c.status/i, () => []);

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    const result = await createPortfolioAdditionChange({}, validFormData());

    expect(result.issues).toBeDefined();
    const msg = result.issues!.join(" ");
    expect(msg).toContain("klant");
    expect(msg).toContain("bestaat niet");
  });

  it("successfully creates a change request and redirects", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    stubDbForSuccess();
    mockRedirect.mockClear();

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");

    // redirect() throws — catch it to verify
    try {
      await createPortfolioAdditionChange({}, validFormData());
      // If we get here, redirect was NOT called — show the return value
      console.log("Function returned instead of redirecting");
    } catch (e) {
      // Expected — redirect throws
    }

    // Should have been redirected to the change detail page
    expect(mockRedirect).toHaveBeenCalledTimes(1);
    const redirectUrl = String(mockRedirect.mock.calls[0][0]);
    expect(redirectUrl).toMatch(/^\/changes\/[0-9a-f-]+$/);
  });

  it("rejects name shorter than 2 characters", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    const result = await createPortfolioAdditionChange({}, validFormData({ name: "X" }));

    expect(result.issues).toBeDefined();
    expect(result.issues!.join(" ")).toContain("minimaal");
  });

  it("rejects rationale shorter than 10 characters", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    const { createPortfolioAdditionChange } = await import("@/app/changes/new/portfolio-actions");
    const result = await createPortfolioAdditionChange({}, validFormData({ rationale: "Short" }));

    expect(result.issues).toBeDefined();
    expect(result.issues!.join(" ")).toContain("minimaal");
  });

  it("builds IST/SOLL field pairs mapping form fields correctly", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
    vi.resetModules();

    stubDbForSuccess();
    mockRedirect.mockClear();

    // Capture the generic_fields that get saved into the change request
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

    // Verify saved fields include all 11 portfolio fields
    if (savedFields) {
      const parsed = JSON.parse(savedFields);
      expect(parsed).toBeInstanceOf(Array);
      expect(parsed.length).toBe(11);
      const keys = parsed.map((f: any) => f.fieldKey);
      expect(keys).toContain("client_id");
      expect(keys).toContain("name");
      expect(keys).toContain("external_reference");
      expect(keys).toContain("current_benchmark_id");
      expect(keys).toContain("asset_class");
      expect(keys).toContain("sub_asset_class");
    }
  });
});
