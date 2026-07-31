import { describe, expect, it } from "vitest";
import {
  ASSET_CLASS_CODES,
  ASSET_CLASS_HIERARCHY,
  ASSET_CLASS_KEYS,
  ASSET_CLASS_SUB_CLASSES,
  ASSET_SUB_ASSET_OPTIONS,
  PARENT_ONLY_ASSET_CLASSES,
  SUB_ASSET_CLASS_CODES,
  getSubClasses,
  isSubClassValid,
} from "@/lib/asset-classes";

describe("asset class catalog", () => {
  it("defines all supplied asset class master values with stable database codes", () => {
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
    expect(ASSET_CLASS_CODES).toEqual({
      CASH: "CS",
      ALTERNATIVES: "AL",
      EQUITIES: "EQ",
      FIXED_INCOME: "FI",
      REAL_ASSETS: "RA",
      MULTI_ASSETS: "MA",
      OVERLAY: "OV",
      IMPACT: "IM",
      OPBOUW: "OP",
      RENDEMENT: "RD",
      RENTE: "RT",
      INFLATION: "IF",
      MATCHING: "MT",
      COLLATERAL: "CL",
      RESERVE: "RV",
    });
  });

  it("derives one code-aware option for every non-null sub asset class", () => {
    const expectedCount = Object.values(ASSET_CLASS_SUB_CLASSES).reduce(
      (total, subClasses) => total + subClasses.length,
      0,
    );

    expect(ASSET_SUB_ASSET_OPTIONS).toHaveLength(expectedCount);
    expect(ASSET_SUB_ASSET_OPTIONS).toHaveLength(107);
    expect(ASSET_SUB_ASSET_OPTIONS).toContainEqual({
      assetClass: "IMPACT",
      assetClassCode: "IM",
      subAssetClass: "IMPACT",
      subAssetClassCode: "IMP",
      sortOrder: 1,
    });
  });

  it("uses letter-only short codes that fit the primary account id format", () => {
    for (const [assetClass, code] of Object.entries(ASSET_CLASS_CODES)) {
      expect(code, `${assetClass} asset class code`).toMatch(/^[A-Z]{1,2}$/);
      expect(code).toHaveLength(2);
    }

    for (const option of ASSET_SUB_ASSET_OPTIONS) {
      expect(option.subAssetClassCode, `${option.assetClass}/${option.subAssetClass}`).toMatch(/^[A-Z]{1,3}$/);
      expect(option.subAssetClassCode).toHaveLength(3);
    }
  });

  it("preserves exact source values, including parent-only rows and double spaces", () => {
    expect(ASSET_CLASS_HIERARCHY).toHaveLength(114);
    expect(PARENT_ONLY_ASSET_CLASSES).toEqual([
      "OPBOUW",
      "RENDEMENT",
      "RENTE",
      "INFLATION",
      "MATCHING",
      "COLLATERAL",
      "RESERVE",
    ]);
    expect(ASSET_CLASS_HIERARCHY).toContainEqual({
      assetClass: "FIXED_INCOME",
      subAssetClass: "SSA GLOBAL  (SOVEREIGN, SUPRANATIONAL, AGENCY)",
      sortOrder: 46,
    });
    expect(ASSET_CLASS_HIERARCHY).toContainEqual({
      assetClass: "FIXED_INCOME",
      subAssetClass: "SSA GREEN BONDS EUR  (SOVEREIGN, SUPRANATIONAL, AGENCY)",
      sortOrder: 47,
    });
    expect(ASSET_CLASS_SUB_CLASSES.OPBOUW).toEqual([]);
  });

  it("can be inserted repeatedly without creating duplicate logical rows", () => {
    const assetRows = new Map<string, string>();
    const subRows = new Map<string, { name: string; sortOrder: number }>();

    for (const pass of [1, 2]) {
      for (const record of ASSET_CLASS_HIERARCHY) {
        assetRows.set(record.assetClass, ASSET_CLASS_CODES[record.assetClass]);
        if (record.subAssetClass === null || record.sortOrder === null) continue;
        subRows.set(`${record.assetClass}/${record.subAssetClass}`, {
          name: record.subAssetClass,
          sortOrder: record.sortOrder,
        });
      }
      expect(pass).toBeGreaterThan(0);
    }

    expect(assetRows.size).toBe(ASSET_CLASS_KEYS.length);
    expect(subRows.size).toBe(ASSET_SUB_ASSET_OPTIONS.length);
    expect([...subRows.keys()].some((key) => key.startsWith("OPBOUW/"))).toBe(false);
  });

  it("keeps sub asset class codes scoped to their parent asset class", () => {
    for (const option of ASSET_SUB_ASSET_OPTIONS) {
      expect(SUB_ASSET_CLASS_CODES[option.assetClass][option.subAssetClass]).toBe(
        option.subAssetClassCode,
      );
      expect(isSubClassValid(option.assetClass, option.subAssetClass)).toBe(true);
      expect(getSubClasses(option.assetClass)).toContain(option.subAssetClass);
    }
  });
});
