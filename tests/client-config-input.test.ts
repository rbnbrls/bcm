/**
 * Tests for client_config input validation schemas.
 *
 * Covers every validation rule from db/clientconfig_validation.ts:
 * - ASSET_SUB_ASSET_OPTIONS data integrity
 * - AssetClassValue, SubAssetClassValue, AssetSubAssetSelection
 * - All entity input schemas (format constraints, required fields)
 * - validateInput helper
 * - generatePrimaryAccountId / validatePrimaryAccountId helpers
 */
import { describe, it, expect } from "vitest";
import {
  ASSET_SUB_ASSET_OPTIONS,
  ASSET_CLASS_VALUES,
  AssetClassValue,
  SubAssetClassValue,
  AssetSubAssetSelection,
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
  validateInput,
  generatePrimaryAccountId,
  validatePrimaryAccountId,
  lookupAssetSubAssetCodes,
} from "@/lib/schemas/clientConfigInput";

// ═════════════════════════════════════════════════════════════════════
// 1. ASSET_SUB_ASSET_OPTIONS data integrity
// ═════════════════════════════════════════════════════════════════════

describe("ASSET_SUB_ASSET_OPTIONS", () => {
  it("should have every sub-asset-class code as exactly 3 uppercase alphanumeric chars", () => {
    for (const opt of ASSET_SUB_ASSET_OPTIONS) {
      expect(opt.subAssetClassCode).toMatch(/^[A-Z0-9]{3}$/);
    }
  });

  it("should have every asset class code as exactly 2 uppercase alpha chars", () => {
    for (const opt of ASSET_SUB_ASSET_OPTIONS) {
      expect(opt.assetClassCode).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("should contain at least one entry for each asset class in ASSET_CLASS_VALUES", () => {
    for (const ac of ASSET_CLASS_VALUES) {
      expect(ASSET_SUB_ASSET_OPTIONS.some((x) => x.assetClass === ac)).toBe(true);
    }
  });

  it("should have all entries with distinct assetClassCode + subAssetClassCode pairs", () => {
    const pairs = ASSET_SUB_ASSET_OPTIONS.map((x) => `${x.assetClassCode}/${x.subAssetClassCode}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 2. AssetClassValue
// ═════════════════════════════════════════════════════════════════════

describe("AssetClassValue", () => {
  it("should accept CASH", () => {
    expect(AssetClassValue.parse("CASH")).toBe("CASH");
  });

  it("should accept EQUITIES, ALTERNATIVES, FIXED_INCOME, REAL_ASSETS", () => {
    for (const ac of ["CASH", "EQUITIES", "ALTERNATIVES", "FIXED_INCOME", "REAL_ASSETS", "MULTI_ASSETS", "OVERLAY", "IMPACT"]) {
      expect(AssetClassValue.parse(ac)).toBe(ac);
    }
  });

  it("should reject unknown asset class", () => {
    expect(() => AssetClassValue.parse("UNKNOWN")).toThrow();
  });

  it("should reject lowercase input", () => {
    expect(() => AssetClassValue.parse("cash")).toThrow();
  });

  it("should reject empty string", () => {
    expect(() => AssetClassValue.parse("")).toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════
// 3. SubAssetClassValue
// ═════════════════════════════════════════════════════════════════════

describe("SubAssetClassValue", () => {
  it("should accept a known sub asset class", () => {
    const result = SubAssetClassValue.safeParse("DEVELOPED MARKETS");
    expect(result.success).toBe(true);
  });

  it("should reject an unknown sub asset class", () => {
    const result = SubAssetClassValue.safeParse("NONEXISTENT SUB CLASS");
    expect(result.success).toBe(false);
  });

  it("should reject empty string", () => {
    const result = SubAssetClassValue.safeParse("");
    expect(result.success).toBe(false);
  });

  it("should reject arbitrary text", () => {
    const result = SubAssetClassValue.safeParse("random text here");
    expect(result.success).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 4. AssetSubAssetSelection (cross-validation)
// ═════════════════════════════════════════════════════════════════════

describe("AssetSubAssetSelection", () => {
  it("should accept a valid pair: EQUITIES + DEVELOPED MARKETS", () => {
    const result = AssetSubAssetSelection.safeParse({
      assetClass: "EQUITIES",
      subAssetClass: "DEVELOPED MARKETS",
    });
    expect(result.success).toBe(true);
  });

  it("should accept a valid pair: FIXED_INCOME + SOVEREIGN EUROPE", () => {
    const result = AssetSubAssetSelection.safeParse({
      assetClass: "FIXED_INCOME",
      subAssetClass: "SOVEREIGN EUROPE",
    });
    expect(result.success).toBe(true);
  });

  it("should accept a valid pair: CASH + CASH", () => {
    const result = AssetSubAssetSelection.safeParse({
      assetClass: "CASH",
      subAssetClass: "CASH",
    });
    expect(result.success).toBe(true);
  });

  it("should reject a valid sub under the wrong asset class: EQUITIES + CASH", () => {
    const result = AssetSubAssetSelection.safeParse({
      assetClass: "EQUITIES",
      subAssetClass: "CASH",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("subAssetClass"))).toBe(true);
    }
  });

  it("should reject FIXED_INCOME + DEVELOPED MARKETS", () => {
    const result = AssetSubAssetSelection.safeParse({
      assetClass: "FIXED_INCOME",
      subAssetClass: "DEVELOPED MARKETS",
    });
    expect(result.success).toBe(false);
  });

  it("should reject unknown asset class", () => {
    const result = AssetSubAssetSelection.safeParse({
      assetClass: "UNKNOWN",
      subAssetClass: "CASH",
    });
    expect(result.success).toBe(false);
  });

  it("should reject unknown sub asset class", () => {
    const result = AssetSubAssetSelection.safeParse({
      assetClass: "EQUITIES",
      subAssetClass: "NONEXISTENT",
    });
    expect(result.success).toBe(false);
  });

  // Test one valid pair per asset class
  it("should accept one valid pair for each of the 8 asset classes", () => {
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
      expect(AssetSubAssetSelection.safeParse({ assetClass: ac, subAssetClass: sac }).success).toBe(true);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// 5. LegalEntityInput
// ═════════════════════════════════════════════════════════════════════

describe("LegalEntityInput", () => {
  it("should accept a valid legal name", () => {
    expect(LegalEntityInput.parse({ legalName: "TEST LEGAL ENTITY B.V." })).toBeTruthy();
  });

  it("should reject empty legal name", () => {
    expect(() => LegalEntityInput.parse({ legalName: "" })).toThrow();
  });

  it("should reject legal name with newline", () => {
    expect(() => LegalEntityInput.parse({ legalName: "TEST\nENTITY" })).toThrow();
  });

  it("should reject legal name exceeding 100 chars", () => {
    expect(() => LegalEntityInput.parse({ legalName: "X".repeat(101) })).toThrow();
  });

  it("should accept legal name of exactly 100 chars", () => {
    expect(LegalEntityInput.parse({ legalName: "X".repeat(100) })).toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════════
// 6. ParentAccountInput
// ═════════════════════════════════════════════════════════════════════

describe("ParentAccountInput", () => {
  it("should accept a valid parent account code", () => {
    expect(ParentAccountInput.parse({ parentAccountCode: "TST_ABC" })).toBeTruthy();
  });

  it("should accept parent account code without underscore", () => {
    expect(ParentAccountInput.parse({ parentAccountCode: "TEST123" })).toBeTruthy();
  });

  it("should reject parent account code with lowercase", () => {
    expect(() => ParentAccountInput.parse({ parentAccountCode: "tst_abc" })).toThrow();
  });

  it("should reject parent account code with special chars", () => {
    expect(() => ParentAccountInput.parse({ parentAccountCode: "TST-ABC" })).toThrow();
  });

  it("should reject parent account code exceeding 16 chars", () => {
    expect(() => ParentAccountInput.parse({ parentAccountCode: "A".repeat(17) })).toThrow();
  });

  it("should accept msaParentAccountCode when provided", () => {
    const result = ParentAccountInput.parse({
      parentAccountCode: "TST_ABC",
      msaParentAccountCode: "MSA_XYZ",
    });
    expect(result.msaParentAccountCode).toBe("MSA_XYZ");
  });

  it("should accept msaParentAccountCode as null", () => {
    const result = ParentAccountInput.parse({
      parentAccountCode: "TST_ABC",
      msaParentAccountCode: null,
    });
    expect(result.msaParentAccountCode).toBeNull();
  });

  it("should accept missing msaParentAccountCode", () => {
    const result = ParentAccountInput.parse({ parentAccountCode: "TST_ABC" });
    expect(result.msaParentAccountCode).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════
// 7. PortfolioInput
// ═════════════════════════════════════════════════════════════════════

describe("PortfolioInput", () => {
  it("should accept a valid 4-char portfolio code", () => {
    expect(PortfolioInput.parse({ portfolioCode: "T0001X" })).toBeTruthy();
  });

  it("should accept a 2-char minimum portfolio code", () => {
    expect(PortfolioInput.parse({ portfolioCode: "T1" })).toBeTruthy();
  });

  it("should accept a 15-char max portfolio code", () => {
    expect(PortfolioInput.parse({ portfolioCode: "T0001ABCDEFGHI" })).toBeTruthy();
  });

  it("should reject portfolio code with lowercase", () => {
    expect(() => PortfolioInput.parse({ portfolioCode: "T0001x" })).toThrow();
  });

  it("should reject portfolio code shorter than 2 chars", () => {
    expect(() => PortfolioInput.parse({ portfolioCode: "A" })).toThrow();
  });

  it("should reject portfolio code longer than 15 chars", () => {
    expect(() => PortfolioInput.parse({ portfolioCode: "A".repeat(16) })).toThrow();
  });

  it("should reject portfolio code with special chars", () => {
    expect(() => PortfolioInput.parse({ portfolioCode: "T0001$" })).toThrow();
  });

  it("should accept parentAccountId as optional positive int", () => {
    expect(PortfolioInput.parse({ portfolioCode: "T0001X", parentAccountId: 1 })).toBeTruthy();
  });

  it("should accept parentAccountId as null", () => {
    expect(PortfolioInput.parse({ portfolioCode: "T0001X", parentAccountId: null })).toBeTruthy();
  });

  it("should accept missing parentAccountId", () => {
    expect(PortfolioInput.parse({ portfolioCode: "T0001X" }).parentAccountId).toBeUndefined();
  });

  it("should coerce string parentAccountId to number", () => {
    const result = PortfolioInput.parse({ portfolioCode: "T0001X", parentAccountId: "5" });
    expect(result.parentAccountId).toBe(5);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 8. ManagerInput
// ═════════════════════════════════════════════════════════════════════

describe("ManagerInput", () => {
  it("should accept a valid manager code and name", () => {
    expect(ManagerInput.parse({ managerCode: "AIM", managerName: "AIM TEST MANAGER" })).toBeTruthy();
  });

  it("should accept manager codes with numbers", () => {
    expect(ManagerInput.parse({ managerCode: "NTX", managerName: "NTX MANAGER" })).toBeTruthy();
  });

  it("should reject manager code shorter than 3 chars", () => {
    expect(() => ManagerInput.parse({ managerCode: "AB", managerName: "AB MANAGER" })).toThrow();
  });

  it("should reject manager code longer than 3 chars", () => {
    expect(() => ManagerInput.parse({ managerCode: "ABCD", managerName: "ABCD MANAGER" })).toThrow();
  });

  it("should reject lowercase manager code", () => {
    expect(() => ManagerInput.parse({ managerCode: "aim", managerName: "AIM TEST" })).toThrow();
  });

  it("should accept manager name with allowed special chars", () => {
    expect(ManagerInput.parse({ managerCode: "ROB", managerName: "ROB TEST & CO (MANAGER)" })).toBeTruthy();
  });

  it("should reject manager name starting with non-alphanumeric", () => {
    expect(() => ManagerInput.parse({ managerCode: "ROB", managerName: "&ROB MANAGER" })).toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════
// 9. BenchmarkInput
// ═════════════════════════════════════════════════════════════════════

describe("BenchmarkInput", () => {
  it("should accept a minimal valid benchmark", () => {
    expect(BenchmarkInput.parse({ benchmarkCode: "MSCI-WORLD-NR" })).toBeTruthy();
  });

  it("should accept benchmark with all optional fields", () => {
    const result = BenchmarkInput.parse({
      benchmarkCode: "MSCI-ACWI-NR",
      benchmarkName: "MSCI ACWI Net Return",
      rimesCode: "MSACWI",
    });
    expect(result.benchmarkName).toBe("MSCI ACWI Net Return");
    expect(result.rimesCode).toBe("MSACWI");
  });

  it("should reject empty benchmark code", () => {
    expect(() => BenchmarkInput.parse({ benchmarkCode: "" })).toThrow();
  });

  it("should reject null benchmark code", () => {
    expect(() => BenchmarkInput.parse({ benchmarkCode: null })).toThrow();
  });

  it("should accept benchmarkName as null", () => {
    const result = BenchmarkInput.parse({ benchmarkCode: "MSCI-WORLD", benchmarkName: null });
    expect(result.benchmarkName).toBeNull();
  });

  it("should accept benchmarkName as undefined", () => {
    const result = BenchmarkInput.parse({ benchmarkCode: "MSCI-WORLD" });
    expect(result.benchmarkName).toBeUndefined();
  });

  it("should accept rimesCode as null", () => {
    const result = BenchmarkInput.parse({ benchmarkCode: "MSCI-WORLD", rimesCode: null });
    expect(result.rimesCode).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════
// 10. ModelInput
// ═════════════════════════════════════════════════════════════════════

describe("ModelInput", () => {
  it("should accept a model code with spaces", () => {
    expect(ModelInput.parse({ modelCode: "TST M1" })).toBeTruthy();
  });

  it("should accept a model code with underscores and hyphens", () => {
    expect(ModelInput.parse({ modelCode: "TST_M-1" })).toBeTruthy();
  });

  it("should reject a model code shorter than 3 chars", () => {
    expect(() => ModelInput.parse({ modelCode: "AB" })).toThrow();
  });

  it("should reject a model code longer than 10 chars", () => {
    expect(() => ModelInput.parse({ modelCode: "ABCDEFGHIJK" })).toThrow();
  });

  it("should reject lowercase model code", () => {
    expect(() => ModelInput.parse({ modelCode: "tst m1" })).toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════
// 11. ClassificationInput
// ═════════════════════════════════════════════════════════════════════

describe("ClassificationInput", () => {
  it("should accept MATCH classification", () => {
    expect(ClassificationInput.parse({ classificationCode: "MATCH" })).toBeTruthy();
  });

  it("should accept RETURN classification", () => {
    expect(ClassificationInput.parse({ classificationCode: "RETURN" })).toBeTruthy();
  });

  it("should accept classification with space and slash", () => {
    expect(ClassificationInput.parse({ classificationCode: "A/B C" })).toBeTruthy();
  });

  it("should reject classification shorter than 2 chars", () => {
    expect(() => ClassificationInput.parse({ classificationCode: "A" })).toThrow();
  });

  it("should reject classification longer than 10 chars", () => {
    expect(() => ClassificationInput.parse({ classificationCode: "ABCDEFGHIJK" })).toThrow();
  });

  it("should reject lowercase", () => {
    expect(() => ClassificationInput.parse({ classificationCode: "match" })).toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════
// 12. StrategyInput
// ═════════════════════════════════════════════════════════════════════

describe("StrategyInput", () => {
  it("should accept CASH strategy", () => {
    expect(StrategyInput.parse({ strategyName: "CASH" })).toBeTruthy();
  });

  it("should accept multi-word strategy", () => {
    expect(StrategyInput.parse({ strategyName: "FIXED_INCOME" })).toBeTruthy();
  });

  it("should reject strategy name shorter than 3 chars", () => {
    expect(() => StrategyInput.parse({ strategyName: "AB" })).toThrow();
  });

  it("should reject strategy name longer than 30 chars", () => {
    expect(() => StrategyInput.parse({ strategyName: "A".repeat(31) })).toThrow();
  });

  it("should reject lowercase start", () => {
    expect(() => StrategyInput.parse({ strategyName: "cash" })).toThrow();
  });

  it("should reject special chars outside allowed set", () => {
    expect(() => StrategyInput.parse({ strategyName: "CASH-FUND" })).toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════
// 13. SubStrategyInput
// ═════════════════════════════════════════════════════════════════════

describe("SubStrategyInput", () => {
  it("should accept a valid sub strategy", () => {
    expect(SubStrategyInput.parse({ strategyId: 1, subStrategyName: "DEVELOPED MARKETS" })).toBeTruthy();
  });

  it("should accept sub strategy with special chars", () => {
    expect(SubStrategyInput.parse({ strategyId: 2, subStrategyName: "LIQUID INVESTMENTS MONEY MARKET" })).toBeTruthy();
  });

  it("should coerce string strategyId to number", () => {
    const result = SubStrategyInput.parse({ strategyId: "3", subStrategyName: "PRIVATE EQUITY" });
    expect(result.strategyId).toBe(3);
  });

  it("should reject zero strategyId", () => {
    expect(() => SubStrategyInput.parse({ strategyId: 0, subStrategyName: "TEST" })).toThrow();
  });

  it("should reject negative strategyId", () => {
    expect(() => SubStrategyInput.parse({ strategyId: -1, subStrategyName: "TEST" })).toThrow();
  });

  it("should reject sub strategy name shorter than 3 chars", () => {
    expect(() => SubStrategyInput.parse({ strategyId: 1, subStrategyName: "AB" })).toThrow();
  });

  it("should reject sub strategy name longer than 50 chars", () => {
    expect(() => SubStrategyInput.parse({ strategyId: 1, subStrategyName: "A".repeat(51) })).toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════
// 14. AccountInput
// ═════════════════════════════════════════════════════════════════════

describe("AccountInput", () => {
  const validAccount = {
    primaryAccountId: "T01*CSFUN*AIM",
    clientCode: "T01",
    portfolioId: 1,
    assetClassId: 1,
    subAssetClassId: 1,
    managerId: 1,
    legalEntityId: 1,
    additionalCode: "ESG",
    longName: "T0001X CSFUN AIM TEST ACCOUNT",
    shortName: "T0001X CSFUN",
    modelId: 1,
    classificationId: 1,
    strategyId: 1,
    subStrategyId: 1,
    benchmarkId: 1,
  };

  it("should accept a fully populated valid account", () => {
    expect(AccountInput.parse(validAccount)).toBeTruthy();
  });

  it("should accept account with optional fields as null", () => {
    const result = AccountInput.parse({
      ...validAccount,
      legalEntityId: null,
      additionalCode: null,
      modelId: null,
      classificationId: null,
      benchmarkId: null,
    });
    expect(result.legalEntityId).toBeNull();
    expect(result.additionalCode).toBeNull();
    expect(result.modelId).toBeNull();
    expect(result.classificationId).toBeNull();
    expect(result.benchmarkId).toBeNull();
  });

  it("should accept account with optional fields omitted", () => {
    const { legalEntityId, additionalCode, modelId, classificationId, benchmarkId, ...minimal } = validAccount;
    const result = AccountInput.parse(minimal);
    expect(result.legalEntityId).toBeUndefined();
    expect(result.additionalCode).toBeUndefined();
  });

  it("should reject invalid primaryAccountId format", () => {
    expect(() => AccountInput.parse({ ...validAccount, primaryAccountId: "INVALID" })).toThrow();
  });

  it("should reject primaryAccountId with lowercase", () => {
    expect(() => AccountInput.parse({ ...validAccount, primaryAccountId: "t0001x_csfun_aim" })).toThrow();
  });

  it("should coerce string numeric fields", () => {
    const result = AccountInput.parse({
      ...validAccount,
      portfolioId: "5",
      assetClassId: "3",
      managerId: "2",
    });
    expect(result.portfolioId).toBe(5);
    expect(result.assetClassId).toBe(3);
    expect(result.managerId).toBe(2);
  });

  it("should reject longName with newline", () => {
    expect(() => AccountInput.parse({ ...validAccount, longName: "LINE1\nLINE2" })).toThrow();
  });

  it("should reject longName exceeding 50 chars", () => {
    expect(() => AccountInput.parse({ ...validAccount, longName: "X".repeat(51) })).toThrow();
  });

  it("should reject shortName exceeding 30 chars", () => {
    expect(() => AccountInput.parse({ ...validAccount, shortName: "X".repeat(31) })).toThrow();
  });

  it("should reject additionalCode exceeding 3 chars", () => {
    expect(() => AccountInput.parse({ ...validAccount, additionalCode: "ABCD" })).toThrow();
  });

  it("should reject additionalCode with lowercase", () => {
    expect(() => AccountInput.parse({ ...validAccount, additionalCode: "esg" })).toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════
// 15. validateInput helper
// ═════════════════════════════════════════════════════════════════════

describe("validateInput", () => {
  it("should return success: true for valid input", () => {
    const result = validateInput(PortfolioInput, { portfolioCode: "T0001X" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.portfolioCode).toBe("T0001X");
    }
  });

  it("should return success: false with issues for invalid input", () => {
    const result = validateInput(PortfolioInput, { portfolioCode: "ab" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0].path).toBe("portfolioCode");
    }
  });

  it("should return issues with correct path notation for nested errors", () => {
    const result = validateInput(AssetSubAssetSelection, {
      assetClass: "EQUITIES",
      subAssetClass: "CASH",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some((i) => i.path === "subAssetClass")).toBe(true);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// 16. generatePrimaryAccountId & validatePrimaryAccountId
// ═════════════════════════════════════════════════════════════════════

describe("generatePrimaryAccountId", () => {
  it("should generate expected format: {portfolioCode}_{code}{code}_{managerCode}", () => {
    const id = generatePrimaryAccountId("T01", "CS", "FUN", "AIM");
    expect(id).toBe("T01*CSFUN*AIM");
  });

  it("should generate correct pattern for equities", () => {
    const id = generatePrimaryAccountId("T02", "EQ", "DEV", "NTX");
    expect(id).toBe("T02*EQDEV*NTX");
  });
});

describe("validatePrimaryAccountId", () => {
  it("should validate a correct primary account id", () => {
    expect(validatePrimaryAccountId("T01*CSFUN*AIM", "T01", "CS", "FUN", "AIM")).toBe(true);
  });

  it("should reject an incorrect primary account id", () => {
    expect(validatePrimaryAccountId("WRG*CSFUN*AIM", "T01", "CS", "FUN", "AIM")).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 17. lookupAssetSubAssetCodes
// ═════════════════════════════════════════════════════════════════════

describe("lookupAssetSubAssetCodes", () => {
  it("should find codes for CASH + LIQUIDITIES", () => {
    const codes = lookupAssetSubAssetCodes("CASH", "LIQUIDITIES");
    expect(codes).toEqual({ assetClassCode: "CS", subAssetClassCode: "LIQ" });
  });

  it("should return null for unknown pair", () => {
    expect(lookupAssetSubAssetCodes("EQUITIES", "CASH")).toBeNull();
  });

  it("should return null for unknown asset class", () => {
    expect(lookupAssetSubAssetCodes("UNKNOWN", "CASH")).toBeNull();
  });
});
