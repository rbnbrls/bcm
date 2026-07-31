/**
 * Tests for lib/asset-classes.ts — the static configuration hierarchy.
 *
 * Covers:
 * - ASSET_CLASS_SUB_CLASSES has the correct structure and all supplied asset classes
 * - ASSET_CLASS_KEYS matches the expected keys
 * - getSubClasses() — lookup by asset class key
 * - isSubClassValid() — pair validation from the config
 * - findAssetClassForSubClass() — reverse lookup
 * - ALL_SUB_ASSET_CLASSES — flattened list
 * - Sub class uniqueness (no sub class belongs to multiple asset classes)
 */
import { describe, it, expect } from "vitest";
import {
  ASSET_CLASS_SUB_CLASSES,
  ASSET_CLASS_KEYS,
  PARENT_ONLY_ASSET_CLASSES,
  getSubClasses,
  isSubClassValid,
  findAssetClassForSubClass,
  ALL_SUB_ASSET_CLASSES,
} from "@/lib/asset-classes";

describe("ASSET_CLASS_SUB_CLASSES — configuration structure", () => {
  it("should have entries for all supplied asset classes", () => {
    expect(Object.keys(ASSET_CLASS_SUB_CLASSES)).toHaveLength(15);
    for (const key of ASSET_CLASS_KEYS) {
      expect(ASSET_CLASS_SUB_CLASSES).toHaveProperty(key);
    }
  });

  it("should have exactly the supplied asset class keys", () => {
    expect(ASSET_CLASS_KEYS).toEqual([
      "CASH",
      "ALTERNATIVES",
      "EQUITIES",
      "FIXED_INCOME",
      "REAL_ASSETS",
      "MULTI_ASSETS",
      "OVERLAY",
      "IMPACT",
      "OPBOUW",
      "RENDEMENT",
      "RENTE",
      "INFLATION",
      "MATCHING",
      "COLLATERAL",
      "RESERVE",
    ]);
  });

  it("each non-parent-only asset class should have at least one valid sub class", () => {
    for (const [key, subs] of Object.entries(ASSET_CLASS_SUB_CLASSES)) {
      if ((PARENT_ONLY_ASSET_CLASSES as readonly string[]).includes(key)) {
        expect(subs, `${key} should be parent-only`).toEqual([]);
      } else {
        expect(subs.length, `${key} has no sub asset classes`).toBeGreaterThan(0);
      }
    }
  });

  it("all sub class values should be non-empty strings", () => {
    for (const [key, subs] of Object.entries(ASSET_CLASS_SUB_CLASSES)) {
      for (const sub of subs) {
        expect(
          typeof sub === "string" && sub.length > 0,
          `${key} contains empty or non-string sub class: ${JSON.stringify(sub)}`,
        ).toBe(true);
      }
    }
  });

  it("some sub class values legitimately overlap across asset classes (e.g. FUNDS, INFRASTRUCTURE, FORESTRY)", () => {
    // This asserts the known domain overlaps, not a bug — some sub classes
    // (e.g. "FUNDS") are valid for multiple asset classes.
    const seen = new Map<string, string[]>();
    for (const [key, subs] of Object.entries(ASSET_CLASS_SUB_CLASSES)) {
      for (const sub of subs) {
        if (seen.has(sub)) {
          seen.get(sub)!.push(key);
        } else {
          seen.set(sub, [key]);
        }
      }
    }
    const duplicates = [...seen.entries()].filter(([, keys]) => keys.length > 1);
    // We know these sub classes legitimately appear in multiple asset classes
    const knownOverlaps = new Set([
      "FUNDS", "LIQUIDITIES", "BIODIVERSITY", "DUURZAAM",
      "PRIVATE EQUITY", "AGRICULTURE", "INFRASTRUCTURE", "FORESTRY",
      "EQUITIES", "INFLATION",
    ]);
    for (const [sub, keys] of duplicates) {
      expect(knownOverlaps.has(sub),
        `"${sub}" appears in [${keys.join(", ")}] but was not expected to overlap`,
      ).toBe(true);
    }
  });
});

describe("getSubClasses — lookup by asset class key", () => {
  it("should return the correct sub classes for CASH", () => {
    expect(getSubClasses("CASH")).toEqual(["CASH", "FUNDS", "LIQUIDITIES"]);
  });

  it("should return the correct sub classes for EQUITIES", () => {
    const equities = getSubClasses("EQUITIES");
    expect(equities).toContain("DEVELOPED MARKETS");
    expect(equities).toContain("AC WORLD");
    expect(equities).toContain("EMERGING MARKETS");
    expect(equities).toContain("FUNDS");
  });

  it("should return the correct sub classes for FIXED_INCOME", () => {
    const fi = getSubClasses("FIXED_INCOME");
    expect(fi).toContain("SOVEREIGN EUROPE");
    expect(fi).toContain("GREENBONDS");
    expect(fi).toContain("HIGH YIELD GLOBAL");
    expect(fi).toContain("MORTGAGES");
  });

  it("should return undefined for an unknown asset class", () => {
    expect(getSubClasses("UNKNOWN")).toBeUndefined();
    expect(getSubClasses("")).toBeUndefined();
    expect(getSubClasses("STOCKS")).toBeUndefined();
  });

  it("should be case-sensitive (lowercase keys don't match)", () => {
    expect(getSubClasses("cash")).toBeUndefined();
    expect(getSubClasses("equities")).toBeUndefined();
  });

  it("should not mutate when called multiple times", () => {
    const a = getSubClasses("EQUITIES");
    const b = getSubClasses("EQUITIES");
    expect(a).toEqual(b);
    // Both should be readonly — but at minimum they should be identical arrays
    expect(a).toHaveLength(b!.length);
  });
});

describe("isSubClassValid — pair validation", () => {
  it("should return true for a valid pair: EQUITIES + AC WORLD", () => {
    expect(isSubClassValid("EQUITIES", "AC WORLD")).toBe(true);
  });

  it("should return true for a valid pair: CASH + LIQUIDITIES", () => {
    expect(isSubClassValid("CASH", "LIQUIDITIES")).toBe(true);
  });

  it("should return true for a valid pair: FIXED_INCOME + SOVEREIGN EUROPE", () => {
    expect(isSubClassValid("FIXED_INCOME", "SOVEREIGN EUROPE")).toBe(true);
  });

  it("should return true for a valid pair: OVERLAY + CURRENCY", () => {
    expect(isSubClassValid("OVERLAY", "CURRENCY")).toBe(true);
  });

  it("should return true for a valid pair: IMPACT + CLIMATE", () => {
    expect(isSubClassValid("IMPACT", "CLIMATE")).toBe(true);
  });

  it("should return true for a valid pair: REAL_ASSETS + FORESTRY", () => {
    expect(isSubClassValid("REAL_ASSETS", "FORESTRY")).toBe(true);
  });

  it("should return false when sub class is valid but for a different asset class", () => {
    // "SOVEREIGN EUROPE" is FIXED_INCOME, not EQUITIES
    expect(isSubClassValid("EQUITIES", "SOVEREIGN EUROPE")).toBe(false);
    // "AC WORLD" is EQUITIES, not CASH
    expect(isSubClassValid("CASH", "AC WORLD")).toBe(false);
    // "CASH" is CASH sub class, not EQUITIES
    expect(isSubClassValid("EQUITIES", "CASH")).toBe(false);
  });

  it("should return false for a completely unknown sub class", () => {
    expect(isSubClassValid("EQUITIES", "NONEXISTENT_SUB_CLASS")).toBe(false);
  });

  it("should return false for unknown asset class even if sub class is valid", () => {
    expect(isSubClassValid("UNKNOWN", "AC WORLD")).toBe(false);
  });

  it("should return false for empty sub class", () => {
    expect(isSubClassValid("EQUITIES", "")).toBe(false);
  });
});

describe("findAssetClassForSubClass — reverse lookup", () => {
  it("should find EQUITIES for 'AC WORLD'", () => {
    expect(findAssetClassForSubClass("AC WORLD")).toEqual(["EQUITIES"]);
  });

  it("should find FIXED_INCOME for 'SOVEREIGN EUROPE'", () => {
    expect(findAssetClassForSubClass("SOVEREIGN EUROPE")).toEqual(["FIXED_INCOME"]);
  });

  it("should find CASH for 'CASH'", () => {
    expect(findAssetClassForSubClass("CASH")).toEqual(["CASH"]);
  });

  it("should find REAL_ASSETS (and also IMPACT) for 'FORESTRY' — forestry is valid for both", () => {
    expect(findAssetClassForSubClass("FORESTRY")).toContain("REAL_ASSETS");
    expect(findAssetClassForSubClass("FORESTRY")).toContain("IMPACT");
  });

  it("should return empty array for unknown sub class", () => {
    expect(findAssetClassForSubClass("NONEXISTENT")).toEqual([]);
  });

  it("should return empty array for empty string", () => {
    expect(findAssetClassForSubClass("")).toEqual([]);
  });

  it("should be case-sensitive", () => {
    expect(findAssetClassForSubClass("ac world")).toEqual([]);
  });
});

describe("ALL_SUB_ASSET_CLASSES — flattened list", () => {
  it("should contain every sub class defined in the hierarchy", () => {
    const expectedCount = Object.values(ASSET_CLASS_SUB_CLASSES).reduce(
      (acc, subs) => acc + subs.length,
      0,
    );
    expect(ALL_SUB_ASSET_CLASSES).toHaveLength(expectedCount);
  });

  it("should be ordered by asset class grouping (not alphabetically)", () => {
    // ALL_SUB_ASSET_CLASSES preserves the order of ASSET_CLASS_SUB_CLASSES
    // (CASH first, then EQUITIES, etc.), with sub classes in declaration order.
    // Just verify the ordering stays consistent: first 3 are CASH sub classes.
    expect(ALL_SUB_ASSET_CLASSES.slice(0, 3)).toEqual(["CASH", "FUNDS", "LIQUIDITIES"]);
  });

  it("should contain specific expected sub classes", () => {
    expect(ALL_SUB_ASSET_CLASSES).toContain("AC WORLD");
    expect(ALL_SUB_ASSET_CLASSES).toContain("SOVEREIGN EUROPE");
    expect(ALL_SUB_ASSET_CLASSES).toContain("FORESTRY");
    expect(ALL_SUB_ASSET_CLASSES).toContain("CLIMATE");
    expect(ALL_SUB_ASSET_CLASSES).toContain("FUNDS");
  });

  it("should contain duplicate entries for sub classes that belong to multiple asset classes", () => {
    // Legitimate duplicates exist: "FUNDS" is in CASH, EQUITIES, FIXED_INCOME, OVERLAY etc.
    const unique = new Set(ALL_SUB_ASSET_CLASSES);
    expect(unique.size).toBeLessThan(ALL_SUB_ASSET_CLASSES.length);
    // Known duplication examples
    const fundsCount = ALL_SUB_ASSET_CLASSES.filter((s) => s === "FUNDS").length;
    expect(fundsCount).toBeGreaterThan(1);
  });
});

describe("Real-world domain pairs", () => {
  it("should validate real-world combinations used in demo fixtures", () => {
    // These are the actual assetClass/subAssetClass pairs from demo fixtures
    expect(isSubClassValid("EQUITIES", "AC WORLD")).toBe(true);
    expect(isSubClassValid("FIXED_INCOME", "SOVEREIGN EUROPE")).toBe(true);
    expect(isSubClassValid("EQUITIES", "DEVELOPED MARKETS")).toBe(true);
  });

  it("should validate one representative valid pair per asset class", () => {
    const pairs: [string, string][] = [
      ["CASH", "CASH"],
      ["EQUITIES", "AC WORLD"],
      ["ALTERNATIVES", "PRIVATE EQUITY"],
      ["REAL_ASSETS", "INFRASTRUCTURE"],
      ["FIXED_INCOME", "SOVEREIGN GLOBAL"],
      ["MULTI_ASSETS", "NEUTRAL"],
      ["OVERLAY", "CURRENCY"],
      ["IMPACT", "CLIMATE"],
    ];
    for (const [ac, sac] of pairs) {
      expect(isSubClassValid(ac, sac), `${ac} + ${sac}`).toBe(true);
    }
  });
});
