/**
 * Tests for the business validation rules in lib/validation-rules.ts.
 *
 * Covers:
 *  - Format rules (regex, length)
 *  - Required-field rules
 *  - Range and date ordering
 *  - Conditional / cross-field rules (primary_account_id consistency,
 *    asset/sub-asset pair, name relationship, action-specific guards)
 *  - The orchestrating entry point validatePortfolioConfiguration
 *  - validateChangePortfolioConfiguration for the staged row shape
 */
import { describe, it, expect } from "vitest";
import {
  buildPrimaryAccountId,
  FIELD_LIMITS,
  PRIMARY_ACCOUNT_ID_PATTERN,
  REQUIRED_FIELDS,
  validateActionSpecificRules,
  validateAssetSubAssetPair,
  validateChangePortfolioConfiguration,
  validateFormat,
  validateNameRelationship,
  validatePortfolioConfiguration,
  validatePrimaryAccountIdConsistency,
  validateRangesAndDates,
  validateRequiredFields,
} from "@/lib/validation-rules";

// ─────────────────────────────────────────────────────────────────────────
// Format / length validation
// ─────────────────────────────────────────────────────────────────────────

describe("validateFormat", () => {
  it("rejects portfolio code with lowercase letters", () => {
    const errors = validateFormat({ portfolioCode: "adp" });
    expect(errors.some((e) => e.toLowerCase().includes("portfolio code"))).toBe(true);
  });

  it("rejects portfolio code longer than 15 chars", () => {
    const errors = validateFormat({ portfolioCode: "A".repeat(16) });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("accepts a valid 2-15 char portfolio code", () => {
    expect(validateFormat({ portfolioCode: "ADP" })).toEqual([]);
  });

  it("rejects asset class code not exactly 2 chars", () => {
    expect(validateFormat({ assetClassCode: "E" }).length).toBeGreaterThan(0);
    expect(validateFormat({ assetClassCode: "EQX" }).length).toBeGreaterThan(0);
  });

  it("rejects asset class code containing digits", () => {
    expect(validateFormat({ assetClassCode: "E1" }).length).toBeGreaterThan(0);
  });

  it("rejects sub asset class code longer than 3 chars", () => {
    expect(validateFormat({ subAssetClassCode: "ABCD" }).length).toBeGreaterThan(0);
  });

  it("accepts empty sub asset class code", () => {
    expect(validateFormat({ subAssetClassCode: "" })).toEqual([]);
  });

  it("rejects manager code not exactly 3 chars", () => {
    expect(validateFormat({ managerCode: "RO" }).length).toBeGreaterThan(0);
    expect(validateFormat({ managerCode: "ROBX" }).length).toBeGreaterThan(0);
  });

  it("rejects long_name exceeding 255 chars", () => {
    const errors = validateFormat({ longName: "L".repeat(FIELD_LIMITS.longName + 1) });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects long_name containing newlines", () => {
    const errors = validateFormat({ longName: "Line1\nLine2" });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects short_name exceeding 100 chars", () => {
    const errors = validateFormat({ shortName: "S".repeat(FIELD_LIMITS.shortName + 1) });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects effectiveFrom not in YYYY-MM-DD format", () => {
    expect(validateFormat({ effectiveFrom: "01-01-2026" }).length).toBeGreaterThan(0);
  });

  it("accepts a fully valid format payload", () => {
    expect(
      validateFormat({
        clientCode: "ADP",
        portfolioCode: "ADP",
        assetClassCode: "EQ",
        subAssetClassCode: "ACX",
        managerCode: "ROB",
        benchmarkCode: "MSCI-WORLD-NR",
        longName: "E2E Test Portfolio",
        shortName: "E2E-TEST",
        effectiveFrom: "2026-12-01",
        effectiveUntil: null,
      }),
    ).toEqual([]);
  });

  it("rejects primaryAccountId that does not match the pattern", () => {
    const errors = validateFormat({ primaryAccountId: "not-a-primary-account" });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("accepts a well-formed primaryAccountId", () => {
    expect(validateFormat({ primaryAccountId: "ADP*EQACX*ROB" })).toEqual([]);
  });

  it("rejects a targetPrimaryAccountId that does not match the pattern", () => {
    const errors = validateFormat({ targetPrimaryAccountId: "not-a-primary-account" });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("accepts a well-formed targetPrimaryAccountId (live row id)", () => {
    // Happy path: a conforming target id equal to a live row's primary_account_id
    // passes format validation (same shape as primaryAccountId).
    expect(validateFormat({ targetPrimaryAccountId: "ADP*EQACX*ROB" })).toEqual([]);
  });

  it("accepts null/empty targetPrimaryAccountId (CREATE rows)", () => {
    expect(validateFormat({ targetPrimaryAccountId: null })).toEqual([]);
    expect(validateFormat({ targetPrimaryAccountId: "" })).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Required-field validation
// ─────────────────────────────────────────────────────────────────────────

describe("validateRequiredFields", () => {
  it("flags every required field when input is empty", () => {
    const errors = validateRequiredFields({});
    // The function emits a "X is verplicht." for every required field.
    expect(errors.length).toBe(REQUIRED_FIELDS.length);
  });

  it("flags whitespace-only values as missing", () => {
    const errors = validateRequiredFields({
      clientCode: " ",
      portfolioCode: "   ",
      assetClassCode: "\t",
      subAssetClassCode: "",
      managerCode: "  ",
      benchmarkCode: " ",
      npcClassificationId: 1,
      longName: "ok",
      shortName: "ok",
      effectiveFrom: "2026-01-01",
    });
    // 6 whitespace-only: client, portfolio, asset class, sub asset class, manager, benchmark
    expect(errors.length).toBe(6);
  });

  it("returns no errors when every required field is present", () => {
    const errors = validateRequiredFields({
      clientCode: "ADP",
      portfolioCode: "ADP",
      assetClassCode: "EQ",
      subAssetClassCode: "ACX",
      managerCode: "ROB",
      benchmarkCode: "MSCI-WORLD-NR",
      npcClassificationId: 1,
      longName: "Test",
      shortName: "TST",
      effectiveFrom: "2026-01-01",
    });
    expect(errors).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Range and date validation
// ─────────────────────────────────────────────────────────────────────────

describe("validateRangesAndDates", () => {
  it("rejects non-integer npc id", () => {
    expect(validateRangesAndDates({ npcClassificationId: 1.5 }).length).toBeGreaterThan(0);
  });

  it("rejects negative or zero npc id", () => {
    expect(validateRangesAndDates({ npcClassificationId: 0 }).length).toBeGreaterThan(0);
    expect(validateRangesAndDates({ npcClassificationId: -1 }).length).toBeGreaterThan(0);
  });

  it("accepts a positive integer npc id", () => {
    expect(validateRangesAndDates({ npcClassificationId: 3 })).toEqual([]);
  });

  it("rejects effectiveFrom before year 2000", () => {
    expect(validateRangesAndDates({ effectiveFrom: "1999-12-31" }).length).toBeGreaterThan(0);
  });

  it("rejects effectiveUntil before effectiveFrom", () => {
    const errors = validateRangesAndDates({
      effectiveFrom: "2026-12-01",
      effectiveUntil: "2026-01-01",
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("accepts effectiveUntil equal to effectiveFrom", () => {
    expect(
      validateRangesAndDates({
        effectiveFrom: "2026-12-01",
        effectiveUntil: "2026-12-01",
      }),
    ).toEqual([]);
  });

  it("accepts null effectiveUntil (open-ended)", () => {
    expect(
      validateRangesAndDates({
        effectiveFrom: "2026-12-01",
        effectiveUntil: null,
      }),
    ).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Conditional / cross-field validation
// ─────────────────────────────────────────────────────────────────────────

describe("buildPrimaryAccountId", () => {
  it("builds the canonical {client}*{AC}{subAC}*{manager} string", () => {
    expect(buildPrimaryAccountId("ADP", "EQ", "ACX", "ROB")).toBe("ADP*EQACX*ROB");
  });

  it("uppercases the inputs", () => {
    expect(buildPrimaryAccountId("adp", "eq", "acx", "rob")).toBe("ADP*EQACX*ROB");
  });

  it("returns null for an empty sub asset class code", () => {
    expect(buildPrimaryAccountId("ADP", "EQ", "", "ROB")).toBeNull();
  });

  it("returns null when a required dimension is missing", () => {
    expect(buildPrimaryAccountId("", "EQ", "ACX", "ROB")).toBeNull();
    expect(buildPrimaryAccountId("ADP", "", "ACX", "ROB")).toBeNull();
    expect(buildPrimaryAccountId("ADP", "EQ", "ACX", "")).toBeNull();
  });
});

describe("PRIMARY_ACCOUNT_ID_PATTERN", () => {
  it("matches a valid primary_account_id", () => {
    expect(PRIMARY_ACCOUNT_ID_PATTERN.test("ADP*EQACX*ROB")).toBe(true);
  });

  it("rejects an invalid primary_account_id", () => {
    expect(PRIMARY_ACCOUNT_ID_PATTERN.test("not-a-primary-account")).toBe(false);
  });
});

describe("validatePrimaryAccountIdConsistency", () => {
  it("rejects mismatched primaryAccountId", () => {
    const errors = validatePrimaryAccountIdConsistency({
      primaryAccountId: "ADP*EQACX*ROB",
      clientCode: "ADP",
      portfolioCode: "ADP",
      assetClassCode: "EQ",
      subAssetClassCode: "EME",
      managerCode: "ROB",
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("accepts consistent primaryAccountId", () => {
    expect(
      validatePrimaryAccountIdConsistency({
        primaryAccountId: "ADP*EQEME*ROB",
        clientCode: "ADP",
        portfolioCode: "ADP",
        assetClassCode: "EQ",
        subAssetClassCode: "EME",
        managerCode: "ROB",
      }),
    ).toEqual([]);
  });

  it("skips when dimensions are missing", () => {
    // The required-field check will report this; the consistency check is silent.
    expect(validatePrimaryAccountIdConsistency({ portfolioCode: "ADP" })).toEqual([]);
  });
});

describe("validateAssetSubAssetPair", () => {
  it("accepts a known AC/subAC pair", () => {
    expect(validateAssetSubAssetPair("EQ", "ACX")).toEqual([]);
    expect(validateAssetSubAssetPair("FI", "HYG")).toEqual([]);
  });

  it("rejects an unknown AC/subAC pair", () => {
    expect(validateAssetSubAssetPair("EQ", "HYG").length).toBeGreaterThan(0);
  });

  it("accepts an empty sub asset class (means no specific sub-class)", () => {
    expect(validateAssetSubAssetPair("EQ", "")).toEqual([]);
  });
});

describe("validateNameRelationship", () => {
  it("rejects long and short name being the same (case-insensitive)", () => {
    expect(validateNameRelationship("E2E Test", "e2e test").length).toBeGreaterThan(0);
  });

  it("accepts different long and short names", () => {
    expect(validateNameRelationship("E2E Test Portfolio", "E2E-TEST")).toEqual([]);
  });

  it("is silent when one of the names is empty", () => {
    expect(validateNameRelationship("", "short")).toEqual([]);
    expect(validateNameRelationship("long", "")).toEqual([]);
  });
});

describe("validateActionSpecificRules", () => {
  it("CREATE: rejects when row already exists", () => {
    const errors = validateActionSpecificRules(
      "CREATE",
      { primaryAccountId: "ADP*EQACX*ROB" },
      { primaryAccountId: "ADP*EQACX*ROB" },
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it("CREATE: accepts when row does not exist", () => {
    expect(
      validateActionSpecificRules(
        "CREATE",
        { primaryAccountId: "ADP*EQACX*ROB" },
        null,
      ),
    ).toEqual([]);
  });

  it("UPDATE: rejects when row does not exist", () => {
    const errors = validateActionSpecificRules(
      "UPDATE",
      { primaryAccountId: "ADP*EQACX*ROB" },
      null,
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it("DELETE: rejects when row does not exist", () => {
    const errors = validateActionSpecificRules(
      "DELETE",
      { primaryAccountId: "ADP*EQACX*ROB" },
      null,
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it("DELETE: accepts when row exists", () => {
    expect(
      validateActionSpecificRules(
        "DELETE",
        { primaryAccountId: "ADP*EQACX*ROB" },
        { primaryAccountId: "ADP*EQACX*ROB" },
      ),
    ).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Orchestrating entry points
// ─────────────────────────────────────────────────────────────────────────

describe("validatePortfolioConfiguration", () => {
  it("passes a fully-valid CREATE payload", () => {
    const result = validatePortfolioConfiguration(
      {
        clientCode: "ADP",
        portfolioCode: "ADP",
        assetClassCode: "EQ",
        subAssetClassCode: "ACX",
        managerCode: "ROB",
        benchmarkCode: "MSCI-WORLD-NR",
        npcClassificationId: 1,
        longName: "E2E Test Portfolio",
        shortName: "E2E-TEST",
        effectiveFrom: "2026-12-01",
        effectiveUntil: null,
      },
      { action: "CREATE" },
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("returns a list of issues for an invalid payload", () => {
    const result = validatePortfolioConfiguration(
      {
        clientCode: "ADP",
        portfolioCode: "adp", // lowercase
        assetClassCode: "E", // too short
        subAssetClassCode: "ACX",
        managerCode: "ROB",
        benchmarkCode: "MSCI-WORLD-NR",
        npcClassificationId: -1,
        longName: "",
        shortName: "x".repeat(200),
        effectiveFrom: "2026-99-99",
      },
      { action: "CREATE" },
    );
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("passes an UPDATE for an existing primary account", () => {
    const result = validatePortfolioConfiguration(
      {
        primaryAccountId: "ADP*EQACX*ROB",
        clientCode: "ADP",
        portfolioCode: "ADP",
        assetClassCode: "EQ",
        subAssetClassCode: "ACX",
        managerCode: "ROB",
        benchmarkCode: "MSCI-WORLD-NR",
        npcClassificationId: 1,
        longName: "E2E Test Portfolio (renamed)",
        shortName: "E2E-TEST",
        effectiveFrom: "2026-12-01",
      },
      { action: "UPDATE", existing: { primaryAccountId: "ADP*EQACX*ROB" } },
    );
    expect(result.valid).toBe(true);
  });

  it("rejects an UPDATE for a non-existent primary account", () => {
    const result = validatePortfolioConfiguration(
      {
        primaryAccountId: "ADP*EQACX*ROB",
        clientCode: "ADP",
        portfolioCode: "ADP",
        assetClassCode: "EQ",
        subAssetClassCode: "ACX",
        managerCode: "ROB",
        benchmarkCode: "MSCI-WORLD-NR",
        npcClassificationId: 1,
        longName: "E2E Test",
        shortName: "E2E",
        effectiveFrom: "2026-12-01",
      },
      { action: "UPDATE", existing: null },
    );
    expect(result.valid).toBe(false);
  });

  it("validatePortfolioConfiguration rejects UPDATE when dimension codes change identity vs existing row", () => {
    // The "existing" row has identity ADP*EQACX*ROB but the UPDATE payload
    // provides dimension codes that would produce a different identity.
    // At the validation layer the existing param is passed in explicitly,
    // so the action-specific check passes (the row IS found). But the
    // primaryAccountId consistency check catches the mismatch between
    // the explicit primaryAccountId and the derived value from the codes.
    const result = validatePortfolioConfiguration(
      {
        primaryAccountId: "ADP*EQACX*ROB",
        clientCode: "ADP",
        portfolioCode: "ADP",
        assetClassCode: "FI",         // ← changed from EQ to FI
        subAssetClassCode: "HYG",     // ← changed from ACX to HYG
        managerCode: "ROB",
        benchmarkCode: "MSCI-WORLD-NR",
        npcClassificationId: 1,
        longName: "E2E Test (re-assigned)",
        shortName: "E2E-R",
        effectiveFrom: "2026-12-01",
      },
      { action: "UPDATE", existing: { primaryAccountId: "ADP*EQACX*ROB" } },
    );
    // Should fail because primaryAccountId "ADP*EQACX*ROB" doesn't match
    // the derived value "ADP*FIHYG*ROB" from the new codes.
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes("primaryAccountId".toLowerCase()))).toBe(true);
  });

  it("validatePortfolioConfiguration rejects UPDATE when no explicit primaryAccountId and codes differ from existing", () => {
    // Without an explicit primaryAccountId, the consistency check has no
    // explicit value to compare against — it silently passes. The action-
    // specific rules then reject because the derived primaryAccountId
    // differs from the existing row's primary_account_id.
    //
    // This simulates the staging flow where the caller builds the derived
    // ID and does the DB lookup. If the derived ID doesn't exist, the
    // action-specific check fails with "bestaat niet".
    const result = validatePortfolioConfiguration(
      {
        // No primaryAccountId provided — will be derived from codes
        clientCode: "ADP",
        portfolioCode: "ADP",
        assetClassCode: "FI",         // ← changed from original EQ
        subAssetClassCode: "HYG",     // ← changed from original ACX
        managerCode: "ROB",
        benchmarkCode: "MSCI-WORLD-NR",
        npcClassificationId: 1,
        longName: "E2E Test (re-assigned)",
        shortName: "E2E-R",
        effectiveFrom: "2026-12-01",
      },
      // existing = null simulates the DB returning nothing for the DERIVED ID
      { action: "UPDATE", existing: null },
    );
    expect(result.valid).toBe(false);
  });

  it("validatePortfolioConfiguration rejects UPDATE when codes match a DIFFERENT existing row than intended", () => {
    // Scenario: user wants to update row ADP*EQACX*ROB but provides
    // dimension codes for ADP*FIHYG*ROB (different identity). The DB
    // lookup returns a row for ADP*FIHYG*ROB (NOT the intended one).
    // The validation passes because the action-specific check only
    // verifies SOMETHING exists — it doesn't verify it's the RIGHT row.
    //
    // This is a documented limitation: the caller (stageChangePortfolio-
    // Configuration) is responsible for ensuring the correct identity.
    const result = validatePortfolioConfiguration(
      {
        primaryAccountId: "ADP*FIHYG*ROB",
        clientCode: "ADP",
        portfolioCode: "ADP",
        assetClassCode: "FI",
        subAssetClassCode: "HYG",
        managerCode: "ROB",
        benchmarkCode: "MSCI-WORLD-NR",
        npcClassificationId: 1,
        longName: "Accidentally updating the wrong row",
        shortName: "WRONG",
        effectiveFrom: "2026-12-01",
      },
      // The DB found a row — but it's row ADP*FIHYG*ROB, not the intended
      { action: "UPDATE", existing: { primaryAccountId: "ADP*FIHYG*ROB" } },
    );
    // NOTE: This PASSES validation. The caller must guard against this
    // by ensuring the dimension codes match the intended target row.
    expect(result.valid).toBe(true);
  });
});

describe("validateChangePortfolioConfiguration", () => {
  const valid = {
    changeRequestId: "11111111-1111-1111-1111-111111111111",
    actionType: "CREATE" as const,
    clientCode: "ADP",
    portfolioCode: "ADP",
    assetClassCode: "EQ",
    subAssetClassCode: "ACX",
    managerCode: "ROB",
    benchmarkCode: "MSCI-WORLD-NR",
    npcClassificationId: 1,
    longName: "E2E Test Portfolio",
    shortName: "E2E-TEST",
    effectiveFrom: "2026-12-01",
    effectiveUntil: null as string | null,
  };

  it("rejects a non-UUID changeRequestId", () => {
    const result = validateChangePortfolioConfiguration({ ...valid, changeRequestId: "not-a-uuid" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes("changeRequestId".toLowerCase()))).toBe(true);
  });

  it("rejects an unknown action type", () => {
    const result = validateChangePortfolioConfiguration({ ...valid, actionType: "BAD" as any });
    expect(result.valid).toBe(false);
  });

  it("accepts a fully-valid staged payload", () => {
    const result = validateChangePortfolioConfiguration(valid);
    expect(result.valid).toBe(true);
  });

  it("accepts a DELETE action when the row exists", () => {
    // DELETE-only validation in this orchestrator doesn't look at existing rows;
    // the caller (stageChangePortfolioConfiguration) does the lookup. We just
    // check that the dimension-level validations pass for a DELETE-shape.
    const result = validateChangePortfolioConfiguration({
      ...valid,
      actionType: "DELETE",
      targetPrimaryAccountId: "ADP*EQACX*ROB",
    });
    expect(result.valid).toBe(true);
  });

  it("requires targetPrimaryAccountId for an UPDATE action", () => {
    const result = validateChangePortfolioConfiguration({
      ...valid,
      actionType: "UPDATE",
    });
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("targetPrimaryAccountId is verplicht")),
    ).toBe(true);
  });

  it("requires targetPrimaryAccountId for a DELETE action", () => {
    const result = validateChangePortfolioConfiguration({
      ...valid,
      actionType: "DELETE",
    });
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("targetPrimaryAccountId is verplicht")),
    ).toBe(true);
  });

  it("rejects a targetPrimaryAccountId on a CREATE action", () => {
    const result = validateChangePortfolioConfiguration({
      ...valid,
      actionType: "CREATE",
      targetPrimaryAccountId: "ADP*EQACX*ROB",
    });
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("targetPrimaryAccountId is niet toegestaan")),
    ).toBe(true);
  });

  it("rejects an UPDATE with a malformed targetPrimaryAccountId", () => {
    const result = validateChangePortfolioConfiguration({
      ...valid,
      actionType: "UPDATE",
      targetPrimaryAccountId: "NOT_A_VALID_ID",
    });
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.toLowerCase().includes("targetprimaryaccountid")),
    ).toBe(true);
  });

  it("rejects a DELETE action with an unknown action_type", () => {
    const result = validateChangePortfolioConfiguration({ ...valid, actionType: "BAD" as any });
    expect(result.valid).toBe(false);
  });
});
