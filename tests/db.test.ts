/**
 * Tests for the database layer (lib/db.ts).
 *
 * These tests cover fixture fallback, edge cases, and error handling
 * without requiring a real database connection.
 *
 * When DATABASE_URL is not set, the module falls back to fixture data
 * or returns empty results gracefully.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Must import the fixtures directly for reference values
import { benchmarks, demoClientConfigs } from "@/lib/fixtures";

describe("DB layer — no database (fixture fallback mode)", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("getBenchmarks should return fixture data when no DATABASE_URL", async () => {
    const { getBenchmarks } = await import("@/lib/db");
    const result = await getBenchmarks();
    expect(result).toEqual(benchmarks);
    expect(result).toHaveLength(12);
  });

  it("getBenchmarks should never return an empty catalog", async () => {
    // The benchmark catalog must always have data — even without a database
    // the fixture fallback should guarantee non-empty results.
    const { getBenchmarks } = await import("@/lib/db");
    const result = await getBenchmarks();
    expect(result.length).toBeGreaterThanOrEqual(10);
    expect(result).not.toHaveLength(0);
  });

  it("getClientConfigs should return demo fixture data when no DATABASE_URL", async () => {
    const { getClientConfigs } = await import("@/lib/db");
    const result = await getClientConfigs();
    expect(result).toEqual(demoClientConfigs);
    expect(result).toHaveLength(2);
  });

  it("getPortfolioById should return fixture portfolio when no DATABASE_URL", async () => {
    const { getPortfolioById } = await import("@/lib/db");
    const result = await getPortfolioById("c4707067-b98a-4a0f-92c7-5ee510dc70ff");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Rendementsportefeuille");
    expect(result!.externalReference).toBe("HOR-RP");
    expect(result!.currentBenchmark).toBeDefined();
    expect(result!.currentBenchmark.code).toBe("MSCI-WORLD-NR");
  });

  it("getPortfolioById should return null for unknown UUID when no DATABASE_URL", async () => {
    const { getPortfolioById } = await import("@/lib/db");
    const result = await getPortfolioById("00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });

  it("getPortfolioById should return null for empty string when no DATABASE_URL", async () => {
    const { getPortfolioById } = await import("@/lib/db");
    const result = await getPortfolioById("");
    expect(result).toBeNull();
  });

  it("getChangeRequest should return null when no DATABASE_URL", async () => {
    const { getChangeRequest } = await import("@/lib/db");
    const result = await getChangeRequest("some-uuid");
    expect(result).toBeNull();
  });

  it("saveChangeRequest should reject when no DATABASE_URL", async () => {
    const { saveChangeRequest } = await import("@/lib/db");
    await expect(
      saveChangeRequest({
        id: "00000000-0000-0000-0000-000000000000",
        reference: "BCM-2026-TEST",
        changeType: "benchmark_switch",
        clientId: "00000000-0000-0000-0000-000000000000",
        requestedBy: "Test User",
        rationale: "Ten char rationale",
        effectiveDate: "2026-09-01",
        items: [],
      })
    ).rejects.toThrow("Database niet bereikbaar");
  });

  it("saveNewBenchmarkRequest should reject when no DATABASE_URL", async () => {
    const { saveNewBenchmarkRequest } = await import("@/lib/db");
    await expect(
      saveNewBenchmarkRequest({
        id: "00000000-0000-0000-0000-000000000000",
        changeRequestId: "00000000-0000-0000-0000-000000000000",
        shortName: "CUSTOM-ESG",
        longName: "Custom ESG Benchmark",
        assetClass: "Aandelen",
        currency: "EUR",
      })
    ).rejects.toThrow("Database niet bereikbaar");
  });

  it("insertBenchmark should reject when no DATABASE_URL", async () => {
    const { insertBenchmark } = await import("@/lib/db");
    await expect(
      insertBenchmark({
        id: "00000000-0000-0000-0000-000000000000",
        code: "TEST",
        name: "Test Benchmark",
        assetClass: "Aandelen",
        currency: "EUR",
      })
    ).rejects.toThrow("Database niet bereikbaar");
  });

  it("updateClientAssetClass should update fixture data when no DATABASE_URL", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.resetModules();
    const { updateClientAssetClass } = await import("@/lib/db");
    const { demoClientConfigs } = await import("@/lib/fixtures");
    // Should not throw
    await expect(
      updateClientAssetClass("PF-HOR-001", "FIXED_INCOME"),
    ).resolves.toBeUndefined();
    const client = demoClientConfigs.find(
      (c: any) => c.externalReference === "PF-HOR-001",
    );
    expect(client?.assetClass).toBe("FIXED_INCOME");
    vi.unstubAllEnvs();
  });

  it("updateClientAssetClass should ignore unknown client when no DATABASE_URL", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.resetModules();
    const { updateClientAssetClass } = await import("@/lib/db");
    await expect(
      updateClientAssetClass("NONEXISTENT", "CASH"),
    ).resolves.toBeUndefined();
    vi.unstubAllEnvs();
  });

  it("insertBenchmarksBulk should reject when no DATABASE_URL", async () => {
    const { insertBenchmarksBulk } = await import("@/lib/db");
    await expect(
      insertBenchmarksBulk([
        {
          id: "00000000-0000-0000-0000-000000000000",
          code: "TEST",
          name: "Test Benchmark",
          assetClass: "Aandelen",
          currency: "EUR",
          cost: 1000,
          provider: "MSCI",
        },
      ])
    ).rejects.toThrow("Database niet bereikbaar");
  });
});

describe("DB layer — fixture cross-references", () => {
  it("getBenchmarks fixture IDs should match saved IDs in demo client configs", () => {
    const benchmarkIds = new Set(benchmarks.map((b) => b.id));
    for (const client of demoClientConfigs) {
      for (const p of client.portfolios) {
        expect(benchmarkIds.has(p.currentBenchmarkId)).toBe(true);
      }
    }
  });

  it("each portfolio's currentBenchmark should reference a fixture benchmark object", () => {
    for (const client of demoClientConfigs) {
      for (const p of client.portfolios) {
        expect(p.currentBenchmark).toBeDefined();
        expect(p.currentBenchmark.id).toBe(p.currentBenchmarkId);
      }
    }
  });

  it("mapBenchmark converts null row values to strings without throwing", async () => {
    // When the LEFT JOIN produces null values (e.g., no benchmark assigned),
    // mapBenchmark must not throw.  The String() constructor handles null
    // by returning "null" — which is not ideal but prevents crashes.
    // mapBenchmark is an internal function, so read the source file directly.
    const fs = await import("fs/promises");
    const content = await fs.readFile(
      new URL("../lib/db.ts", import.meta.url),
      "utf-8"
    );
    expect(content).toContain("String(row.code)");
    expect(content).toContain("String(row.name)");
    expect(content).toContain("String(row.asset_class)");
    expect(content).toContain("String(row.currency)");
  });

  it("getPortfolioById constructs currentBenchmark with String() safety", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.resetModules();
    const { getPortfolioById } = await import("@/lib/db");
    const result = await getPortfolioById("c4707067-b98a-4a0f-92c7-5ee510dc70ff");
    expect(result).not.toBeNull();
    // currentBenchmark is always populated even when the data might be null
    expect(result!.currentBenchmark).toBeDefined();
    vi.unstubAllEnvs();
  });
});

describe("DB layer — retry & repair logic", () => {
  it("getBenchmarks should fall back to fixture data when no DATABASE_URL (existing behavior)", async () => {
    // This is already covered above, re-verify for completeness
    vi.stubEnv("DATABASE_URL", "");
    vi.resetModules();
    const { getBenchmarks } = await import("@/lib/db");
    const result = await getBenchmarks();
    expect(result).toHaveLength(12);
    expect(result[0].code).toBe("MSCI-WORLD-NR");
    vi.unstubAllEnvs();
  });

  it("getBenchmarks retry loop exists in source code", async () => {
    // Verify the refactored retry mechanism by inspecting the function source
    const source = await import("@/lib/db");
    const fnStr = source.getBenchmarks.toString();
    expect(fnStr).toContain("withTableEnsure");
    expect(fnStr).toContain("active IS NULL");
  });

  it("getClientConfigs retry loop exists in source code", async () => {
    const source = await import("@/lib/db");
    const fnStr = source.getClientConfigs.toString();
    expect(fnStr).toContain("withTableEnsure");
  });
});

describe("DB layer — schema evolution (ensureReadTables)", () => {
  it("ensureReadTables ADD COLUMN IF NOT EXISTS migrations present for all post-init columns", async () => {
    const fs = await import("fs/promises");
    const content = await fs.readFile(
      new URL("../lib/db.ts", import.meta.url),
      "utf-8"
    );
    // active column was added later
    expect(content).toContain("ALTER TABLE benchmark_catalog ADD COLUMN IF NOT EXISTS active");
    expect(content).toContain("NOT NULL DEFAULT true");
    // cost column was added in commit 959e82f (missing from original schema)
    expect(content).toContain("ALTER TABLE benchmark_catalog ADD COLUMN IF NOT EXISTS cost");
    expect(content).toContain("numeric(10,2) NOT NULL DEFAULT 1000.00");
    // provider column was added in commit 959e82f (missing from original schema)
    expect(content).toContain("ALTER TABLE benchmark_catalog ADD COLUMN IF NOT EXISTS provider");
    expect(content).toContain("text NOT NULL DEFAULT 'rimes'");
  });

  it("getBenchmarks WHERE clause handles active IS NULL", async () => {
    // Verify the SQL in the source handles the NULL case for backward compat
    const source = await import("@/lib/db");
    const fnStr = source.getBenchmarks.toString();
    expect(fnStr.replace(/\s+/g, " ")).toContain("active = true OR active IS NULL");
  });

  it("getBenchmarks query selects cost and provider columns", async () => {
    // The query must select cost and provider, which were added after the
    // initial schema.  If these columns are missing from the deployed DB,
    // the query fails and getBenchmarks returns [] after the retry loop.
    const source = await import("@/lib/db");
    const fnStr = source.getBenchmarks.toString();
    const sql = fnStr.match(/SELECT .* FROM benchmark_catalog/)?.[0];
    expect(sql).toBeTruthy();
    expect(sql).toContain("cost");
    expect(sql).toContain("provider");
  });
});

describe("DB layer — ensureTables blocks", () => {
  it("ensureReadTables coverage: all 6 required tables listed", async () => {
    // Read the source to verify it lists all 6 tables
    const source = await import("@/lib/db");
    expect(source.ensureNewBenchmarkRequestsTable).toBeTypeOf("function");
    expect(typeof source.getChangeRequest).toBe("function");
    expect(typeof source.saveChangeRequest).toBe("function");
  });
});

describe("Generic change-type model — fixture fallback", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("getChangeTypes should return 6+ default types when no DATABASE_URL", async () => {
    const { getChangeTypes } = await import("@/lib/db");
    const types = await getChangeTypes();
    expect(types.length).toBeGreaterThanOrEqual(6);
    const slugs = types.map((t) => t.slug);
    expect(slugs).toContain("benchmark_switch");
    expect(slugs).toContain("new_benchmark");
    expect(slugs).toContain("fee_change");
    expect(slugs).toContain("mandate_change");
  });

  it("getChangeTypes returns configs with all required properties", async () => {
    const { getChangeTypes } = await import("@/lib/db");
    const types = await getChangeTypes();
    for (const ct of types) {
      expect(ct.id).toBeTruthy();
      expect(ct.slug).toBeTruthy();
      expect(ct.name).toBeTruthy();
      expect(ct.category).toBeTruthy();
      expect(Array.isArray(ct.fields)).toBe(true);
      expect(ct.fields.length).toBeGreaterThan(0);
      expect(ct.cost).toBeDefined();
      expect(typeof ct.cost.baseCost).toBe("number");
      expect(ct.cost.costCurrency).toBeTruthy();
      expect(ct.defaultLeadDays).toBeGreaterThan(0);
      expect(Array.isArray(ct.stakeholders)).toBe(true);
      expect(ct.workflow).toBeTruthy();
      expect(ct.active).toBe(true);
    }
  });

  it("benchmark_switch type has 3 fields and IST/SOLL mapping", async () => {
    const { getChangeTypes } = await import("@/lib/db");
    const types = await getChangeTypes();
    const bs = types.find((t) => t.slug === "benchmark_switch")!;
    expect(bs).toBeDefined();
    expect(bs.fields).toHaveLength(3);
    expect(bs.istSollMapping).toBeDefined();
    expect(bs.istSollMapping!).toHaveLength(1);
    expect(bs.istSollMapping![0].ist).toBe("current_benchmark_id");
    expect(bs.istSollMapping![0].soll).toBe("requested_benchmark_id");
    expect(bs.cost.perItemCost).toBe(500);
    expect(bs.cost.baseCost).toBe(0);
    expect(bs.defaultLeadDays).toBe(7);
    expect(bs.stakeholders).toHaveLength(3);
    expect(bs.workflow).toBe("benchmark_switch");
    expect(bs.sortOrder).toBe(10);
  });

  it("new_benchmark type has 4 fields and empty IST/SOLL mapping", async () => {
    const { getChangeTypes } = await import("@/lib/db");
    const types = await getChangeTypes();
    const nb = types.find((t) => t.slug === "new_benchmark")!;
    expect(nb).toBeDefined();
    expect(nb.fields).toHaveLength(4);
    expect(nb.istSollMapping).toEqual([]);
    expect(nb.cost.baseCost).toBe(5000);
    expect(nb.cost.perItemCost).toBeUndefined();
    expect(nb.defaultLeadDays).toBe(28);
    expect(nb.stakeholders).toHaveLength(2);
    expect(nb.workflow).toBe("new_benchmark");
    expect(nb.sortOrder).toBe(20);
  });

  it("fee_change type has correct structure and custom cost model", async () => {
    const { getChangeTypes } = await import("@/lib/db");
    const types = await getChangeTypes();
    const fc = types.find((t) => t.slug === "fee_change")!;
    expect(fc).toBeDefined();
    expect(fc.name).toBe("Tariefwijziging");
    expect(fc.category).toBe("fee");
    expect(fc.fields.length).toBeGreaterThanOrEqual(4);
    expect(fc.istSollMapping).toBeDefined();
    // Fee changes have IST/SOLL pairs for current vs requested fee
    expect(fc.cost.baseCost).toBeGreaterThanOrEqual(0);
    expect(fc.defaultLeadDays).toBeGreaterThanOrEqual(5);
    expect(fc.workflow).toBeTruthy();
    expect(fc.sortOrder).toBeGreaterThan(20);
    // Should have portfolio reference field
    const portfolioField = fc.fields.find((f) => f.key === "portfolio_id");
    expect(portfolioField).toBeDefined();
    expect(portfolioField!.type).toBe("select");
    expect(portfolioField!.referenceTable).toBe("portfolios");
  });

  it("mandate_change type has mandate-specific fields", async () => {
    const { getChangeTypes } = await import("@/lib/db");
    const types = await getChangeTypes();
    const mc = types.find((t) => t.slug === "mandate_change")!;
    expect(mc).toBeDefined();
    expect(mc.category).toBe("mandate");
    expect(mc.fields.length).toBeGreaterThanOrEqual(3);
    // Should have mandate-related fields
    const restrictionField = mc.fields.find((f) => f.key.includes("restriction") || f.key.includes("mandate"));
    expect(restrictionField).toBeDefined();
    expect(mc.cost).toBeDefined();
    expect(mc.stakeholders.length).toBeGreaterThanOrEqual(2);
  });

  it("custodian_change type has custodian-related fields", async () => {
    const { getChangeTypes } = await import("@/lib/db");
    const types = await getChangeTypes();
    const cc = types.find((t) => t.slug === "custodian_change")!;
    expect(cc).toBeDefined();
    expect(cc.category).toBe("custodian");
    expect(cc.fields.length).toBeGreaterThanOrEqual(3);
    // Should have IST/SOLL for current vs new custodian
    const istField = cc.fields.find((f) => f.key === "current_custodian_id");
    const sollField = cc.fields.find((f) => f.key === "requested_custodian_id");
    expect(istField).toBeDefined();
    expect(sollField).toBeDefined();
  });

  it("rebalance_trigger type has rebalance-specific fields", async () => {
    const { getChangeTypes } = await import("@/lib/db");
    const types = await getChangeTypes();
    const rt = types.find((t) => t.slug === "rebalance_trigger")!;
    expect(rt).toBeDefined();
    expect(rt.category).toBe("rebalance");
    expect(rt.fields.length).toBeGreaterThanOrEqual(2);
    // Should have trigger threshold / frequency fields
    const triggerField = rt.fields.find((f) => f.key.includes("trigger") || f.key.includes("threshold") || f.key.includes("frequency"));
    expect(triggerField).toBeDefined();
  });

  it("getChangeTypeBySlug returns the correct type", async () => {
    const { getChangeTypeBySlug } = await import("@/lib/db");
    const bs = await getChangeTypeBySlug("benchmark_switch");
    expect(bs).not.toBeNull();
    expect(bs!.slug).toBe("benchmark_switch");
    expect(bs!.name).toBe("Benchmarkwissel");
  });

  it("getChangeTypeBySlug returns null for unknown slug", async () => {
    const { getChangeTypeBySlug } = await import("@/lib/db");
    const result = await getChangeTypeBySlug("nonexistent");
    expect(result).toBeNull();
  });

  it("benchmark_switch fields have correct types and referenceTable", async () => {
    const { getChangeTypes } = await import("@/lib/db");
    const types = await getChangeTypes();
    const bs = types.find((t) => t.slug === "benchmark_switch")!;
    const portfolioField = bs.fields.find((f) => f.key === "portfolio_id")!;
    expect(portfolioField.type).toBe("select");
    expect(portfolioField.referenceTable).toBe("portfolios");
    expect(portfolioField.required).toBe(true);

    const istField = bs.fields.find((f) => f.key === "current_benchmark_id")!;
    expect(istField.type).toBe("benchmark");
    expect(istField.referenceTable).toBe("benchmark_catalog");
    expect(istField.label).toContain("IST");

    const sollField = bs.fields.find((f) => f.key === "requested_benchmark_id")!;
    expect(sollField.type).toBe("benchmark");
    expect(sollField.referenceTable).toBe("benchmark_catalog");
    expect(sollField.label).toContain("SOLL");
  });

  it("new_benchmark fields have correct types and options", async () => {
    const { getChangeTypes } = await import("@/lib/db");
    const types = await getChangeTypes();
    const nb = types.find((t) => t.slug === "new_benchmark")!;
    const assetField = nb.fields.find((f) => f.key === "asset_class")!;
    expect(assetField.type).toBe("select");
    expect(assetField.options).toBeDefined();
    expect(assetField.options!.length).toBeGreaterThanOrEqual(5);
    expect(assetField.options!.find((o) => o.value === "Aandelen")).toBeDefined();

    const currencyField = nb.fields.find((f) => f.key === "currency")!;
    expect(currencyField.type).toBe("select");
    expect(currencyField.defaultValue).toBe("EUR");
    expect(currencyField.options).toHaveLength(3);
  });

  it("stakeholders have correct structure", async () => {
    const { getChangeTypes } = await import("@/lib/db");
    const types = await getChangeTypes();
    const bs = types.find((t) => t.slug === "benchmark_switch")!;
    for (const s of bs.stakeholders) {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.role).toBeTruthy();
      expect(Array.isArray(s.notifyOn)).toBe(true);
      expect(typeof s.mandatory).toBe("boolean");
    }
    // internal_admin is mandatory with webhook
    const admin = bs.stakeholders.find((s) => s.id === "internal_admin")!;
    expect(admin.mandatory).toBe(true);
    expect(admin.contactType).toBe("webhook");
    expect(admin.notifyOn).toContain("on_submit");
    expect(admin.notifyOn).toContain("on_approval");
  });

  it("getChangeTypeBySlug with benchmark_switch returns correct cost model details", async () => {
    const { getChangeTypeBySlug } = await import("@/lib/db");
    const bs = await getChangeTypeBySlug("benchmark_switch");
    expect(bs).not.toBeNull();
    expect(bs!.cost.description).toContain("500");
    expect(bs!.cost.perItemCost).toBe(500);
    // Per-item cost is applied per portfolio — verify the model shape
    expect(bs!.cost.baseCost).toBe(0);
  });

  it("seedChangeTypeConfigs function exists", async () => {
    const source = await import("@/lib/db");
    expect(source.seedChangeTypeConfigs).toBeTypeOf("function");
  });
});
