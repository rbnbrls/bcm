import { describe, it, expect } from "vitest";
import { ASSET_SUB_ASSET_OPTIONS } from "@/lib/asset-classes";
import {
  generatePrimaryAccountId,
  validatePrimaryAccountId,
  lookupCodes,
  isValidLongName,
  isValidShortName,
} from "@/lib/portfolio-config";

describe("generatePrimaryAccountId", () => {
  it("builds upper-cased business key from parts", () => {
    expect(generatePrimaryAccountId("ADP", "FI", "HYG", "ROB")).toBe("ADP*FIHYG*ROB");
  });

  it("uses 2-letter asset and 3-letter sub asset codes in the business key", () => {
    expect(generatePrimaryAccountId("BAK", "RA", "COM", "ROB")).toBe("BAK*RACOM*ROB");
  });

  it("generates unique keys for every asset/sub asset combination for one client and manager", () => {
    const ids = ASSET_SUB_ASSET_OPTIONS.map((option) =>
      generatePrimaryAccountId("BAK", option.assetClassCode, option.subAssetClassCode, "ROB"),
    );

    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^BAK\*[A-Z]{2}[A-Z]{3}\*ROB$/);
    }
  });
});

describe("validatePrimaryAccountId", () => {
  it("accepts exact match", () => {
    expect(validatePrimaryAccountId("ADP*FIHYG*ROB", "ADP", "FI", "HYG", "ROB")).toBe(true);
  });
  it("rejects wrong composition even if uppercase", () => {
    expect(validatePrimaryAccountId("ADP*FIHYG*ROB", "ADP", "FI", "HYG", "AAA")).toBe(false);
  });
});

describe("lookupCodes", () => {
  it("resolves known asset/sub-asset pair", () => {
    const r = lookupCodes("FIXED_INCOME", "SOVEREIGN GLOBAL");
    expect(r).toEqual({ assetClassCode: "FI", subAssetClassCode: "SOG" });
  });
  it("returns null for unknown pair", () => {
    expect(lookupCodes("UNKNOWN", "NOPE")).toBeNull();
  });
});

describe("isValidLongName / isValidShortName", () => {
  it("accepts plain ASCII no newlines within limit", () => {
    expect(isValidLongName("Alpha Beta Gamma")).toBe(true);
    expect(isValidShortName("Short")).toBe(true);
  });
  it("rejects newlines", () => {
    expect(isValidLongName("A\nB")).toBe(false);
    expect(isValidShortName("A\rB")).toBe(false);
  });
  it("rejects empty and too long", () => {
    expect(isValidLongName("")).toBe(false);
    expect(isValidShortName("")).toBe(false);
    expect(isValidLongName("X".repeat(256))).toBe(false);
    expect(isValidShortName("X".repeat(101))).toBe(false);
  });
});
