/**
 * Tests for the governed change flow for user-requestable lookup dimensions.
 *
 * Covers:
 *  - stageChangeLookupRequest: validation + duplicate detection + staging
 *  - getChangeLookupRequests: reads staged rows (fallback when no DB)
 *  - applyChangeLookupRequests: inserts new asset class / sub asset class /
 *    benchmark into the live lookup tables with the bypass GUC
 *  - applyNewBenchmarkRequest: legacy benchmark flow apply
 *  - change-processor routing for new_asset_class / new_sub_asset_class /
 *    new_benchmark change types
 *  - reference-data-driven code lookup for newly applied values
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock the sql layer (postgres-js) ────────────────────────────────────
const queryHandlers = new Map<string, (sql: string, params: unknown[]) => unknown[]>();
const unmatchedSqlLog: string[] = [];

function onQuery(
  pattern: RegExp,
  handler: (sql: string, params: unknown[]) => unknown[],
): void {
  queryHandlers.set(pattern.source, handler);
}
function clearQueryHandlers(): void {
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
        // skip
      }
    }
    unmatchedSqlLog.push(reconstructed.substring(0, 200));
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

describe("stageChangeLookupRequest (mocked DB)", () => {
  it("rejects an invalid asset class code without inserting", async () => {
    let insertCalled = false;
    onQuery(/INSERT INTO client_config\.change_lookup_request/i, () => {
      insertCalled = true;
      return [{ id: 1 }];
    });

    const { stageChangeLookupRequest } = await import("@/lib/client-config-db");
    const result = await stageChangeLookupRequest({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      dimension: "asset_class",
      assetClassCode: "PRIVAT", // 6 chars — invalid
      assetClassName: "PRIVATE MARKETS",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.includes("2 hoofdletters"))).toBe(true);
    }
    expect(insertCalled).toBe(false);
  });

  it("rejects a sub asset class whose parent does not exist", async () => {
    onQuery(
      /SELECT asset_class_code FROM client_config\.asset_class/i,
      () => [],
    );
    let insertCalled = false;
    onQuery(/INSERT INTO client_config\.change_lookup_request/i, () => {
      insertCalled = true;
      return [{ id: 1 }];
    });

    const { stageChangeLookupRequest } = await import("@/lib/client-config-db");
    const result = await stageChangeLookupRequest({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
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

  it("rejects a duplicate staged value in an open change request", async () => {
    onQuery(
      /SELECT asset_class_code FROM client_config\.asset_class/i,
      () => [{ asset_class_code: "PR" }],
    );
    onQuery(
      /FROM client_config\.change_lookup_request clr/i,
      () => [{ id: 42 }],
    );
    let insertCalled = false;
    onQuery(/INSERT INTO client_config\.change_lookup_request/i, () => {
      insertCalled = true;
      return [{ id: 1 }];
    });

    const { stageChangeLookupRequest } = await import("@/lib/client-config-db");
    const result = await stageChangeLookupRequest({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      dimension: "sub_asset_class",
      parentAssetClassCode: "PR",
      subAssetClassCode: "PRI",
      subAssetClassName: "PRIVATE EQUITY",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.includes("al eerder aangevraagd"))).toBe(true);
    }
    expect(insertCalled).toBe(false);
  });

  it("stages a valid asset class addition", async () => {
    onQuery(
      /SELECT asset_class_code FROM client_config\.asset_class/i,
      () => [],
    );
    onQuery(
      /FROM client_config\.change_lookup_request clr/i,
      () => [],
    );
    onQuery(/INSERT INTO client_config\.change_lookup_request/i, () => [{ id: 9 }]);

    const { stageChangeLookupRequest } = await import("@/lib/client-config-db");
    const result = await stageChangeLookupRequest({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      dimension: "asset_class",
      assetClassCode: "pr",
      assetClassName: "PRIVATE MARKETS",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.id).toBe("9");
    }
  });

  it("stages a valid sub asset class addition with parent resolution", async () => {
    onQuery(
      /SELECT asset_class_code FROM client_config\.asset_class/i,
      () => [{ asset_class_code: "PR" }],
    );
    onQuery(
      /FROM client_config\.change_lookup_request clr/i,
      () => [],
    );
    onQuery(/INSERT INTO client_config\.change_lookup_request/i, () => [{ id: 10 }]);

    const { stageChangeLookupRequest } = await import("@/lib/client-config-db");
    const result = await stageChangeLookupRequest({
      changeRequestId: "11111111-1111-1111-1111-111111111111",
      dimension: "sub_asset_class",
      parentAssetClassCode: "PR",
      subAssetClassCode: "PRI",
      subAssetClassName: "PRIVATE EQUITY",
      sortOrder: 3,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.id).toBe("10");
    }
  });
});

describe("getChangeLookupRequests (mocked DB)", () => {
  it("returns staged lookup rows for the change request", async () => {
    onQuery(
      /FROM client_config\.change_lookup_request/i,
      () => [
        {
          id: 1,
          change_request_id: "11111111-1111-1111-1111-111111111111",
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

    const { getChangeLookupRequests } = await import("@/lib/client-config-db");
    const rows = await getChangeLookupRequests("11111111-1111-1111-1111-111111111111");
    expect(rows).toHaveLength(1);
    expect(rows[0].dimension).toBe("asset_class");
    expect(rows[0].assetClassCode).toBe("PR");
    expect(rows[0].applyStatus).toBe("pending");
  });

  it("returns empty array when the DB is unavailable (fixture fallback)", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { getChangeLookupRequests } = await import("@/lib/client-config-db");
    const rows = await getChangeLookupRequests("11111111-1111-1111-1111-111111111111");
    expect(rows).toEqual([]);
  });
});

describe("applyChangeLookupRequests (mocked DB)", () => {
  it("applies a new asset class and a sub asset class to the live tables", async () => {
    // getChangeLookupRequests reads the staged rows
    onQuery(
      /FROM client_config\.change_lookup_request/i,
      () => [
        {
          id: 1,
          change_request_id: "11111111-1111-1111-1111-111111111111",
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
        {
          id: 2,
          change_request_id: "11111111-1111-1111-1111-111111111111",
          dimension: "sub_asset_class",
          asset_class_code: null,
          asset_class_name: null,
          parent_asset_class_code: "PR",
          sub_asset_class_code: "PRI",
          sub_asset_class_name: "PRIVATE EQUITY",
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

    // asset_class existence check → not present → insert
    onQuery(
      /SELECT 1 FROM client_config\.asset_class/i,
      () => [],
    );
    // parent resolution for the sub asset class
    onQuery(
      /SELECT asset_class_id FROM client_config\.asset_class/i,
      () => [{ asset_class_id: 20 }],
    );
    // sub_asset_class existence check → not present
    onQuery(
      /SELECT 1 FROM client_config\.sub_asset_class/i,
      () => [],
    );

    let insertCount = 0;
    onQuery(/INSERT INTO client_config\.asset_class/i, () => { insertCount++; return []; });
    onQuery(/INSERT INTO client_config\.sub_asset_class/i, () => { insertCount++; return []; });
    onQuery(/UPDATE client_config\.change_lookup_request/i, () => []);

    const { applyChangeLookupRequests } = await import("@/lib/client-config-db");
    const result = await applyChangeLookupRequests("11111111-1111-1111-1111-111111111111");
    expect(result.success).toBe(true);
    expect(result.applied).toHaveLength(2);
    expect(result.applied.every((a) => a.result === "applied")).toBe(true);
    expect(insertCount).toBe(2);
  });

  it("skips asset classes that already exist in the live table", async () => {
    onQuery(
      /FROM client_config\.change_lookup_request/i,
      () => [
        {
          id: 1,
          change_request_id: "11111111-1111-1111-1111-111111111111",
          dimension: "asset_class",
          asset_class_code: "EQ",
          asset_class_name: "EQUITIES",
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
    // Existing row found
    onQuery(
      /SELECT 1 FROM client_config\.asset_class/i,
      () => [{ 1: 1 }],
    );
    let insertCalled = false;
    onQuery(/INSERT INTO client_config\.asset_class/i, () => { insertCalled = true; return []; });
    onQuery(/UPDATE client_config\.change_lookup_request/i, () => []);

    const { applyChangeLookupRequests } = await import("@/lib/client-config-db");
    const result = await applyChangeLookupRequests("11111111-1111-1111-1111-111111111111");
    expect(result.applied[0].result).toBe("skipped");
    expect(insertCalled).toBe(false);
  });

  it("returns success with no-op when there are no staged rows", async () => {
    onQuery(
      /FROM client_config\.change_lookup_request/i,
      () => [],
    );

    const { applyChangeLookupRequests } = await import("@/lib/client-config-db");
    const result = await applyChangeLookupRequests("11111111-1111-1111-1111-111111111111");
    expect(result.success).toBe(true);
    expect(result.applied).toEqual([]);
  });
});

describe("applyNewBenchmarkRequest (legacy benchmark flow)", () => {
  it("inserts the staged benchmark into client_config.benchmark", async () => {
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
    onQuery(
      /SELECT 1 FROM client_config\.benchmark/i,
      () => [],
    );
    let insertCalled = false;
    onQuery(/INSERT INTO client_config\.benchmark/i, () => { insertCalled = true; return []; });

    const { applyNewBenchmarkRequest } = await import("@/lib/client-config-db");
    const result = await applyNewBenchmarkRequest("11111111-1111-1111-1111-111111111111");
    expect(result.success).toBe(true);
    expect(result.applied[0].result).toBe("applied");
    expect(insertCalled).toBe(true);
  });

  it("skips when the benchmark already exists", async () => {
    onQuery(
      /FROM new_benchmark_requests/i,
      () => [
        {
          short_name: "MSCI-WORLD-NR",
          long_name: "MSCI World Net Return",
          currency: "EUR",
        },
      ],
    );
    onQuery(
      /SELECT 1 FROM client_config\.benchmark/i,
      () => [{ 1: 1 }],
    );
    let insertCalled = false;
    onQuery(/INSERT INTO client_config\.benchmark/i, () => { insertCalled = true; return []; });

    const { applyNewBenchmarkRequest } = await import("@/lib/client-config-db");
    const result = await applyNewBenchmarkRequest("11111111-1111-1111-1111-111111111111");
    expect(result.applied[0].result).toBe("skipped");
    expect(insertCalled).toBe(false);
  });
});

describe("change-processor routing for lookup-addition change types", () => {
  it("routes new_asset_class through applyChangeLookupRequests", async () => {
    // No staged portfolio-config rows
    onQuery(
      /FROM client_config\.change_portfolio_configuration/i,
      () => [],
    );
    // Staged lookup rows exist
    onQuery(
      /FROM client_config\.change_lookup_request/i,
      () => [
        {
          id: 1,
          change_request_id: "11111111-1111-1111-1111-111111111111",
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
    onQuery(
      /SELECT 1 FROM client_config\.asset_class/i,
      () => [],
    );
    onQuery(/INSERT INTO client_config\.asset_class/i, () => []);
    onQuery(/UPDATE client_config\.change_lookup_request/i, () => []);

    const { processChangeForProcessedStatus } = await import("@/lib/change-processor");
    const result = await processChangeForProcessedStatus(
      "11111111-1111-1111-1111-111111111111",
      "new_asset_class",
    );
    expect(result.applied).toBe(true);
    expect(result.usedLegacy).toBe(false);
    expect(result.stagedRows).toBe(1);
  });

  it("routes new_benchmark through applyNewBenchmarkRequest", async () => {
    onQuery(
      /FROM client_config\.change_portfolio_configuration/i,
      () => [],
    );
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
    onQuery(
      /SELECT 1 FROM client_config\.benchmark/i,
      () => [],
    );
    onQuery(/INSERT INTO client_config\.benchmark/i, () => []);

    const { processChangeForProcessedStatus } = await import("@/lib/change-processor");
    const result = await processChangeForProcessedStatus(
      "11111111-1111-1111-1111-111111111111",
      "new_benchmark",
    );
    expect(result.applied).toBe(true);
    expect(result.usedLegacy).toBe(false);
  });
});

describe("change type catalog + reference prefixes", () => {
  it("registers new_asset_class and new_sub_asset_class in the default catalog", async () => {
    const { DEFAULT_CHANGE_TYPE_CONFIGS } = await import("@/lib/db");
    const slugs = DEFAULT_CHANGE_TYPE_CONFIGS.map((c) => c.slug);
    expect(slugs).toContain("new_asset_class");
    expect(slugs).toContain("new_sub_asset_class");
    const ac = DEFAULT_CHANGE_TYPE_CONFIGS.find((c) => c.slug === "new_asset_class");
    expect(ac?.active).toBe(true);
    expect(ac?.defaultLeadDays).toBe(21);
    const sac = DEFAULT_CHANGE_TYPE_CONFIGS.find((c) => c.slug === "new_sub_asset_class");
    expect(sac?.active).toBe(true);
    expect(sac?.defaultLeadDays).toBe(14);
  });

  it("generates reference prefixes for the new change types", async () => {
    const { generateReference } = await import("@/lib/change-form-utils");
    const year = new Date().getFullYear();
    expect(generateReference("new_asset_class")).toMatch(new RegExp(`^BCM-${year}-AC-\\d{6}$`));
    expect(generateReference("new_sub_asset_class")).toMatch(new RegExp(`^BCM-${year}-SA-\\d{6}$`));
  });
});

describe("lookupCodesFromReferenceData (lockstep validation)", () => {
  it("resolves codes for a value added via the governed flow", async () => {
    const { lookupCodesFromReferenceData } = await import("@/lib/portfolio-config");

    const referenceData = {
      clients: [],
      portfolios: [],
      assetClasses: [
        { assetClassId: 99, assetClassCode: "PR", assetClassName: "PRIVATE MARKETS" },
      ],
      subAssetClasses: [
        { subAssetClassId: 990, assetClassId: 99, subAssetClassCode: "PRI", subAssetClassName: "PRIVATE EQUITY", sortOrder: 1 },
      ],
      managers: [],
      benchmarks: [],
      npcClassifications: [],
    } as any;

    const codes = lookupCodesFromReferenceData("PRIVATE MARKETS", "PRIVATE EQUITY", referenceData);
    expect(codes).toEqual({ assetClassCode: "PR", subAssetClassCode: "PRI" });
  });

  it("returns null for an unknown pair", async () => {
    const { lookupCodesFromReferenceData } = await import("@/lib/portfolio-config");
    const referenceData = { assetClasses: [], subAssetClasses: [], clients: [], portfolios: [], managers: [], benchmarks: [], npcClassifications: [] } as any;
    const codes = lookupCodesFromReferenceData("UNKNOWN", "UNKNOWN", referenceData);
    expect(codes).toBeNull();
  });
});
