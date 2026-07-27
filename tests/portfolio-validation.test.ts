/**
 * Tests for portfolio field validation.
 *
 * Covers:
 * - validatePortfolioAssetClass — asset class required & known
 * - validatePortfolioSubAssetClass — sub asset class required
 * - validateAssetSubClassPair — pair validation against hierarchy
 * - validatePortfolioFields — combined validation
 */
import { describe, it, expect } from "vitest";
import {
  validatePortfolioAssetClass,
  validatePortfolioSubAssetClass,
  validateAssetSubClassPair,
  validatePortfolioFields,
} from "@/lib/portfolio-validation";

describe("validatePortfolioAssetClass", () => {
  it("should reject empty string", () => {
    const result = validatePortfolioAssetClass("");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("verplicht");
    }
  });

  it("should reject whitespace-only string", () => {
    const result = validatePortfolioAssetClass("   ");
    expect(result.valid).toBe(false);
  });

  it("should reject unknown asset class", () => {
    const result = validatePortfolioAssetClass("INVALID");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("INVALID");
    }
  });

  it("should accept CASH", () => {
    expect(validatePortfolioAssetClass("CASH").valid).toBe(true);
  });

  it("should accept EQUITIES", () => {
    expect(validatePortfolioAssetClass("EQUITIES").valid).toBe(true);
  });

  it("should accept FIXED_INCOME", () => {
    expect(validatePortfolioAssetClass("FIXED_INCOME").valid).toBe(true);
  });

  it("should accept all 8 standard asset classes", () => {
    for (const ac of ["CASH", "EQUITIES", "ALTERNATIVES", "REAL_ASSETS", "FIXED_INCOME", "MULTI_ASSETS", "OVERLAY", "IMPACT"]) {
      expect(validatePortfolioAssetClass(ac).valid).toBe(true);
    }
  });
});

describe("validatePortfolioSubAssetClass", () => {
  it("should reject empty string", () => {
    const result = validatePortfolioSubAssetClass("");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("verplicht");
    }
  });

  it("should accept a valid sub class value", () => {
    expect(validatePortfolioSubAssetClass("AC WORLD").valid).toBe(true);
  });
});

describe("validateAssetSubClassPair", () => {
  it("should reject sub class that doesn't exist for the given asset class", () => {
    const result = validateAssetSubClassPair("EQUITIES", "SOVEREIGN EUROPE");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("SOVEREIGN EUROPE");
      expect(result.errors[0]).toContain("EQUITIES");
    }
  });

  it("should accept a valid EQUITIES sub class", () => {
    expect(validateAssetSubClassPair("EQUITIES", "AC WORLD").valid).toBe(true);
    expect(validateAssetSubClassPair("EQUITIES", "DEVELOPED MARKETS").valid).toBe(true);
    expect(validateAssetSubClassPair("EQUITIES", "EMERGING MARKETS").valid).toBe(true);
  });

  it("should accept a valid CASH sub class", () => {
    expect(validateAssetSubClassPair("CASH", "CASH").valid).toBe(true);
    expect(validateAssetSubClassPair("CASH", "FUNDS").valid).toBe(true);
    expect(validateAssetSubClassPair("CASH", "LIQUIDITIES").valid).toBe(true);
  });

  it("should accept a valid FIXED_INCOME sub class", () => {
    expect(validateAssetSubClassPair("FIXED_INCOME", "SOVEREIGN EUROPE").valid).toBe(true);
    expect(validateAssetSubClassPair("FIXED_INCOME", "GREENBONDS").valid).toBe(true);
    expect(validateAssetSubClassPair("FIXED_INCOME", "HIGH YIELD GLOBAL").valid).toBe(true);
  });

  it("should reject empty sub class", () => {
    const result = validateAssetSubClassPair("EQUITIES", "");
    expect(result.valid).toBe(false);
  });

  it("should return error for unknown asset class", () => {
    const result = validateAssetSubClassPair("UNKNOWN", "CASH");
    expect(result.valid).toBe(false);
  });
});

describe("validatePortfolioFields — combined", () => {
  it("should accept valid combination: EQUITIES + AC WORLD", () => {
    const errors = validatePortfolioFields({
      assetClass: "EQUITIES",
      subAssetClass: "AC WORLD",
    });
    expect(errors).toHaveLength(0);
  });

  it("should accept valid combination: FIXED_INCOME + SOVEREIGN EUROPE", () => {
    const errors = validatePortfolioFields({
      assetClass: "FIXED_INCOME",
      subAssetClass: "SOVEREIGN EUROPE",
    });
    expect(errors).toHaveLength(0);
  });

  it("should reject invalid combination: EQUITIES + CASH", () => {
    const errors = validatePortfolioFields({
      assetClass: "EQUITIES",
      subAssetClass: "CASH",
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("should reject unknown asset class with valid sub", () => {
    const errors = validatePortfolioFields({
      assetClass: "INVALID",
      subAssetClass: "AC WORLD",
    });
    expect(errors.length).toBeGreaterThan(0);
    // assetClass error should be present
    expect(errors.some((e) => e.includes("INVALID"))).toBe(true);
  });

  it("should reject missing asset class", () => {
    const errors = validatePortfolioFields({
      subAssetClass: "AC WORLD",
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("verplicht"))).toBe(true);
  });

  it("should reject missing sub asset class", () => {
    const errors = validatePortfolioFields({
      assetClass: "EQUITIES",
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("verplicht"))).toBe(true);
  });

  it("should report multiple errors when both are missing", () => {
    const errors = validatePortfolioFields({});
    expect(errors.length).toBeGreaterThan(1);
  });

  it("should accept null/undefined fields gracefully", () => {
    const errors = validatePortfolioFields({
      assetClass: null,
      subAssetClass: null,
    });
    expect(errors.length).toBeGreaterThan(0);
    // Should not crash
  });

  it("should handle whitespace in asset class", () => {
    const errors = validatePortfolioFields({
      assetClass: "  REAL_ASSETS  ",
      subAssetClass: "INFRASTRUCTURE",
    });
    expect(errors).toHaveLength(0);
  });

  // Test every asset class with one valid sub class each
  it("should accept one valid sub for each of the 8 asset classes", () => {
    const validPairs: [string, string][] = [
      ["CASH", "FUNDS"],
      ["EQUITIES", "DEVELOPED MARKETS"],
      ["ALTERNATIVES", "PRIVATE EQUITY"],
      ["REAL_ASSETS", "INFRASTRUCTURE"],
      ["FIXED_INCOME", "SOVEREIGN GLOBAL"],
      ["MULTI_ASSETS", "NEUTRAL"],
      ["OVERLAY", "CURRENCY"],
      ["IMPACT", "CLIMATE"],
    ];
    for (const [ac, sac] of validPairs) {
      expect(validatePortfolioFields({ assetClass: ac, subAssetClass: sac })).toHaveLength(0);
    }
  });
});
