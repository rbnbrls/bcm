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
  PARENT_ONLY_ASSET_CLASSES,
  AssetClassValue,
  SubAssetClassValue,
  AssetSubAssetSelection,
  LegalEntityInput,
  ParentAccountInput,
  PortfolioInput,
  ManagerInput,
  BenchmarkInput,
  PortfolioConfigurationInput,
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
      expect(opt.subAssetClassCode).toMatch(/^[A-Z]{3}$/);
    }
  });

  it("should have every asset class code as exactly 2 uppercase alpha chars", () => {
    for (const opt of ASSET_SUB_ASSET_OPTIONS) {
      expect(opt.assetClassCode).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("should contain entries for every non-parent-only asset class", () => {
    for (const ac of ASSET_CLASS_VALUES) {
      const hasSubAssets = ASSET_SUB_ASSET_OPTIONS.some((x) => x.assetClass === ac);
      if (PARENT_ONLY_ASSET_CLASSES.includes(ac)) {
        expect(hasSubAssets).toBe(false);
      } else {
        expect(hasSubAssets).toBe(true);
      }
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
  it("should accept one valid pair for each asset class that has sub classes", () => {
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

  it("should accept parent-only asset classes with null sub asset class", () => {
    for (const assetClass of PARENT_ONLY_ASSET_CLASSES) {
      expect(AssetSubAssetSelection.safeParse({ assetClass, subAssetClass: null }).success).toBe(true);
    }
  });

  it("should reject a sub asset class for parent-only asset classes", () => {
    const result = AssetSubAssetSelection.safeParse({
      assetClass: "OPBOUW",
      subAssetClass: "CASH",
    });
    expect(result.success).toBe(false);
  });

  it("should reject null sub asset class for asset classes that have sub classes", () => {
    const result = AssetSubAssetSelection.safeParse({
      assetClass: "CASH",
      subAssetClass: null,
    });
    expect(result.success).toBe(false);
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
// 10. PortfolioConfigurationInput
// ═════════════════════════════════════════════════════════════════════

describe("PortfolioConfigurationInput", () => {
  const validConfiguration = {
    primaryAccountId: "T01*CSFUN*AIM",
    clientCode: "T01",
    portfolioCode: "T0001X",
    assetClassCode: "CS",
    subAssetClassCode: "FUN",
    managerCode: "AIM",
    benchmarkCode: "TST_BENCH_1",
    npcClassificationId: 1,
    longName: "T0001X CSFUN AIM TEST CONFIGURATION",
    shortName: "T0001X CSFUN",
    activeInd: true,
    effectiveFrom: "2026-01-01",
    effectiveUntil: null,
  };

  it("should accept a fully populated valid portfolio configuration", () => {
    expect(PortfolioConfigurationInput.parse(validConfiguration)).toBeTruthy();
  });

  it("should accept effectiveUntil omitted", () => {
    const { effectiveUntil, ...minimal } = validConfiguration;
    const result = PortfolioConfigurationInput.parse(minimal);
    expect(result.effectiveUntil).toBeUndefined();
  });

  it("should default activeInd to true", () => {
    const { activeInd, ...minimal } = validConfiguration;
    const result = PortfolioConfigurationInput.parse(minimal);
    expect(result.activeInd).toBe(true);
  });

  it("should reject invalid primaryAccountId format", () => {
    expect(() => PortfolioConfigurationInput.parse({ ...validConfiguration, primaryAccountId: "INVALID" })).toThrow();
  });

  it("should reject primaryAccountId with lowercase", () => {
    expect(() => PortfolioConfigurationInput.parse({ ...validConfiguration, primaryAccountId: "t0001x_csfun_aim" })).toThrow();
  });

  it("should coerce npcClassificationId", () => {
    const result = PortfolioConfigurationInput.parse({
      ...validConfiguration,
      npcClassificationId: "5",
    });
    expect(result.npcClassificationId).toBe(5);
  });

  it("should reject longName with newline", () => {
    expect(() => PortfolioConfigurationInput.parse({ ...validConfiguration, longName: "LINE1\nLINE2" })).toThrow();
  });

  it("should reject longName exceeding 255 chars", () => {
    expect(() => PortfolioConfigurationInput.parse({ ...validConfiguration, longName: "X".repeat(256) })).toThrow();
  });

  it("should reject shortName exceeding 100 chars", () => {
    expect(() => PortfolioConfigurationInput.parse({ ...validConfiguration, shortName: "X".repeat(101) })).toThrow();
  });

  it("should reject invalid direct dimension codes", () => {
    expect(() => PortfolioConfigurationInput.parse({ ...validConfiguration, assetClassCode: "CASH" })).toThrow();
    expect(() => PortfolioConfigurationInput.parse({ ...validConfiguration, subAssetClassCode: "F1N" })).toThrow();
    expect(() => PortfolioConfigurationInput.parse({ ...validConfiguration, managerCode: "AI" })).toThrow();
  });

  it("should reject invalid effective dates", () => {
    expect(() => PortfolioConfigurationInput.parse({ ...validConfiguration, effectiveFrom: "01-01-2026" })).toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════
// 11. validateInput helper
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
