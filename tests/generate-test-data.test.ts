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
  ModelInput,
  ClassificationInput,
  StrategyInput,
  SubStrategyInput,
  AccountInput,
} from "@/lib/schemas/clientConfigInput";

// ═════════════════════════════════════════════════════════════════════
// Basic generation
// ═════════════════════════════════════════════════════════════════════

describe("generateTestData", () => {
  it("should generate the requested number of accounts", () => {
    const data = generateTestData(50, 20260728);
    expect(data.accounts).toHaveLength(50);
    expect(data.portfolios).toHaveLength(50);
  });

  it("should default to 25 accounts when count is omitted", () => {
    const data = generateTestData();
    expect(data.accounts).toHaveLength(25);
    expect(data.portfolios).toHaveLength(25);
  });

  it("should generate at least 1 account", () => {
    const data = generateTestData(1, 42);
    expect(data.accounts).toHaveLength(1);
  });

  it("should include complete reference data", () => {
    const data = generateTestData(10, 0);
    expect(data.legalEntities).toHaveLength(2);
    expect(data.parentAccounts).toHaveLength(2);
    expect(data.managers).toHaveLength(3);
    expect(data.benchmarks).toHaveLength(3);
    expect(data.models).toHaveLength(2);
    expect(data.classifications).toHaveLength(3);
    expect(data.strategies).toHaveLength(8);
    expect(data.subStrategies).toHaveLength(ASSET_SUB_ASSET_OPTIONS.length);
  });

  it("should be deterministic (same seed → same output)", () => {
    const a = generateTestData(100, 12345);
    const b = generateTestData(100, 12345);
    expect(a.accounts).toEqual(b.accounts);
    expect(a.portfolios).toEqual(b.portfolios);
  });

  it("should produce different data with a different seed", () => {
    const a = generateTestData(100, 1);
    const b = generateTestData(100, 2);
    expect(a.accounts).not.toEqual(b.accounts);
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

  describe("models", () => {
    for (const [i, m] of data.models.entries()) {
      it(`model[${i}] (${(m as Record<string, unknown>).modelCode}) should be valid`, () => {
        const result = ModelInput.safeParse(m);
        expect(result.success).toBe(true);
      });
    }
  });

  describe("classifications", () => {
    for (const [i, c] of data.classifications.entries()) {
      it(`classification[${i}] (${(c as Record<string, unknown>).classificationCode}) should be valid`, () => {
        const result = ClassificationInput.safeParse(c);
        expect(result.success).toBe(true);
      });
    }
  });

  describe("strategies", () => {
    for (const [i, s] of data.strategies.entries()) {
      it(`strategy[${i}] (${(s as Record<string, unknown>).strategyName}) should be valid`, () => {
        const result = StrategyInput.safeParse(s);
        expect(result.success).toBe(true);
      });
    }
  });

  describe("sub-strategies", () => {
    for (const [i, ss] of data.subStrategies.entries()) {
      it(`subStrategy[${i}] (${(ss as Record<string, unknown>).subStrategyName}) should be valid`, () => {
        const result = SubStrategyInput.safeParse(ss);
        expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
      });
    }
  });

  describe("accounts", () => {
    for (const [i, acct] of data.accounts.entries()) {
      it(`account[${i}] (${(acct as Record<string, unknown>).primaryAccountId}) should be valid`, () => {
        const result = AccountInput.safeParse(acct);
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
    const ids = data.accounts.map(
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
