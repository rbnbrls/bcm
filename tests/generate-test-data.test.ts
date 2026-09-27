/**
 * Tests for the client config test data generator.
 *
 * Validates that generate_test_data.ts produces records that pass
 * all Zod input schemas, and that the generator is deterministic
 * and configurable.
 */
import { describe, it, expect } from "vitest";
import { generateTestData } from "@/db/generate_test_data";
import {
  ASSET_SUB_ASSET_OPTIONS,
  LegalEntityInput,
  ParentAccountInput,
  PortfolioInput,
  ManagerInput,
  BenchmarkInput,
  PortfolioConfigurationInput,
} from "@/lib/schemas/clientConfigInput";

// ═════════════════════════════════════════════════════════════════════
// Basic generation
// ═════════════════════════════════════════════════════════════════════

describe("generateTestData", () => {
  it("should generate the requested number of portfolio configurations", () => {
    const data = generateTestData(50, 20260728);
    expect(data.portfolioConfigurations).toHaveLength(50);
    expect(data.portfolios).toHaveLength(50);
  });

  it("should default to 25 portfolio configurations when count is omitted", () => {
    const data = generateTestData();
    expect(data.portfolioConfigurations).toHaveLength(25);
    expect(data.portfolios).toHaveLength(25);
  });

  it("should generate at least 1 portfolio configuration", () => {
    const data = generateTestData(1, 42);
    expect(data.portfolioConfigurations).toHaveLength(1);
  });

  it("should include complete reference data", () => {
    const data = generateTestData(10, 0);
    expect(data.legalEntities).toHaveLength(2);
    expect(data.parentAccounts).toHaveLength(2);
    expect(data.managers).toHaveLength(3);
    expect(data.benchmarks).toHaveLength(3);
  });

  it("should be deterministic (same seed → same output)", () => {
    const a = generateTestData(100, 12345);
    const b = generateTestData(100, 12345);
    expect(a.portfolioConfigurations).toEqual(b.portfolioConfigurations);
    expect(a.portfolios).toEqual(b.portfolios);
  });

  it("should produce different data with a different seed", () => {
    const a = generateTestData(100, 1);
    const b = generateTestData(100, 2);
    expect(a.portfolioConfigurations).not.toEqual(b.portfolioConfigurations);
  });
});

// ═════════════════════════════════════════════════════════════════════
// Schema validation — every record must pass its Zod schema
// ═════════════════════════════════════════════════════════════════════

describe("generated records pass schema validation", () => {
  const data = generateTestData(100, 20260728);

  describe("legal entities", () => {
    for (const [i, entity] of data.legalEntities.entries()) {
      it(`legalEntity[${i}] (${(entity as Record<string, unknown>).legalName}) should be valid`, () => {
        const result = LegalEntityInput.safeParse(entity);
        expect(result.success).toBe(true);
      });
    }
  });

  describe("parent accounts", () => {
    for (const [i, pa] of data.parentAccounts.entries()) {
      it(`parentAccount[${i}] (${(pa as Record<string, unknown>).parentAccountCode}) should be valid`, () => {
        const result = ParentAccountInput.safeParse(pa);
        expect(result.success).toBe(true);
      });
    }
  });

  describe("portfolios", () => {
    for (const [i, pf] of data.portfolios.entries()) {
      it(`portfolio[${i}] (${(pf as Record<string, unknown>).portfolioCode}) should be valid`, () => {
        const result = PortfolioInput.safeParse(pf);
        expect(result.success).toBe(true);
      });
    }
  });

  describe("managers", () => {
    for (const [i, m] of data.managers.entries()) {
      it(`manager[${i}] (${(m as Record<string, unknown>).managerCode}) should be valid`, () => {
        const result = ManagerInput.safeParse(m);
        expect(result.success).toBe(true);
      });
    }
  });

  describe("benchmarks", () => {
    for (const [i, b] of data.benchmarks.entries()) {
      it(`benchmark[${i}] (${(b as Record<string, unknown>).benchmarkCode}) should be valid`, () => {
        const result = BenchmarkInput.safeParse(b);
        expect(result.success).toBe(true);
      });
    }
  });

  describe("portfolio configurations", () => {
    for (const [i, config] of data.portfolioConfigurations.entries()) {
      it(`portfolioConfiguration[${i}] (${(config as Record<string, unknown>).primaryAccountId}) should be valid`, () => {
        const result = PortfolioConfigurationInput.safeParse(config);
        expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
      });
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// Edge cases
// ═════════════════════════════════════════════════════════════════════

describe("generateTestData edge cases", () => {
  it("should produce unique portfolio codes", () => {
    const data = generateTestData(200, 99);
    const codes = data.portfolios.map(
      (p) => (p as Record<string, unknown>).portfolioCode,
    );
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("should produce unique primary account IDs", () => {
    const data = generateTestData(200, 77);
    const ids = data.portfolioConfigurations.map(
      (a) => (a as Record<string, unknown>).primaryAccountId,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should include valid metadata", () => {
    const data = generateTestData(42, 2026);
    expect(data.metadata.fictitious).toBe(true);
    expect(data.metadata.seed).toBe(2026);
    expect(data.metadata.count).toBe(42);
    expect(data.metadata.generatedAt).toBeDefined();
    expect(() => new Date(data.metadata.generatedAt)).not.toThrow();
  });

  it("should include the full ASSET_SUB_ASSET_OPTIONS array", () => {
    const data = generateTestData(1, 0);
    expect(data.availableAssetSubAssetOptions).toEqual(
      ASSET_SUB_ASSET_OPTIONS,
    );
  });
});
