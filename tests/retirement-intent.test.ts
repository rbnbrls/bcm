/**
 * Unit tests for the retirement-intent helpers (lib/retirement-intent.ts).
 *
 * These pure helpers drive the "show retirement intent in change detail and
 * audit history" acceptance: the detail page and the PDF export detect a
 * retirement change, render its target portfolio configuration and produce
 * the audit sentence "Portefeuilleconfiguratie X beëindigd per Y".
 */
import { describe, it, expect } from "vitest";
import {
  formatRetirementAuditMessage,
  formatRetirementTarget,
  getRetirementLongName,
  getRetirementPortfolioCode,
  getRetirementRow,
  isRetirementChange,
  RETIRE_ACTION_TYPE,
  RETIRE_CHANGE_TYPE_SLUG,
  RETIRE_TITLE,
} from "@/lib/retirement-intent";

const deleteRow = {
  id: 1,
  changeRequestId: "cr-1",
  actionType: "DELETE",
  targetPrimaryAccountId: "HOR-EQ-DEV-EIG",
  clientCode: "HOR",
  portfolioCode: "HORRP",
  assetClassCode: "EQ",
  subAssetClassCode: "DEV",
  managerCode: "EIG",
  benchmarkCode: "MSCI",
  npcClassificationId: 5,
  longName: "Holdingmaatschappij Rijnland Portefeuille",
  shortName: "HRP",
  effectiveFrom: "2026-12-01",
  effectiveUntil: null,
  applyStatus: null,
  applyError: null,
};

const updateRow = { ...deleteRow, id: 2, actionType: "UPDATE", targetPrimaryAccountId: "ZEK-FI--BLG" };

const baseRequest: any = {
  changeType: RETIRE_CHANGE_TYPE_SLUG,
  effectiveDate: "2026-12-01",
  changePortfolioConfigurations: [deleteRow],
  fields: [
    { fieldKey: "primary_account_id", istValue: "HOR-EQ-DEV-EIG", sollValue: "HOR-EQ-DEV-EIG" },
    { fieldKey: "action_type", istValue: null, sollValue: "DELETE" },
  ],
};

describe("isRetirementChange", () => {
  it("detects the dedicated retire change type slug", () => {
    expect(isRetirementChange({ ...baseRequest, changeType: RETIRE_CHANGE_TYPE_SLUG })).toBe(true);
  });

  it("detects a staged DELETE row even under a legacy slug", () => {
    expect(
      isRetirementChange({ ...baseRequest, changeType: "portfolio_addition" }),
    ).toBe(true);
  });

  it("returns false for non-retirement changes without DELETE rows", () => {
    expect(
      isRetirementChange({
        changeType: "benchmark_switch",
        effectiveDate: "2026-12-01",
        changePortfolioConfigurations: [updateRow],
        fields: [],
      }),
    ).toBe(false);
    expect(
      isRetirementChange({ changeType: "benchmark_switch", effectiveDate: "2026-12-01" }),
    ).toBe(false);
  });
});

describe("getRetirementRow", () => {
  it("prefers the staged DELETE row", () => {
    const row = getRetirementRow({ ...baseRequest, changePortfolioConfigurations: [updateRow, deleteRow] });
    expect(row?.actionType).toBe(RETIRE_ACTION_TYPE);
    expect(row?.portfolioCode).toBe("HORRP");
  });

  it("falls back to the first staged row when no DELETE row exists", () => {
    const row = getRetirementRow({ ...baseRequest, changePortfolioConfigurations: [updateRow] });
    expect(row?.actionType).toBe("UPDATE");
  });

  it("returns null without staged rows", () => {
    expect(getRetirementRow({ changeType: "x", effectiveDate: "2026-12-01" })).toBeNull();
  });
});

describe("formatRetirementTarget", () => {
  it("builds the CLIENT-ASSETCLASS-SUBASSET-MANAGER identity from the staged row", () => {
    expect(formatRetirementTarget(baseRequest)).toBe("HOR-EQ-DEV-EIG");
  });

  it("renders a dash for a missing sub asset class", () => {
    const row = { ...deleteRow, subAssetClassCode: "" };
    expect(formatRetirementTarget({ ...baseRequest, changePortfolioConfigurations: [row] })).toBe("HOR-EQ—-EIG");
  });

  it("falls back to the staged generic fields when no staged row exists", () => {
    const request = {
      changeType: RETIRE_CHANGE_TYPE_SLUG,
      effectiveDate: "2026-12-01",
      fields: [
        { fieldKey: "portfolio_code", istValue: "HORRP", sollValue: "HORRP" },
        { fieldKey: "long_name", istValue: "Oud", sollValue: "Holdingmaatschappij Rijnland Portefeuille" },
      ],
    };
    expect(formatRetirementTarget(request)).toBe("HORRP");
  });

  it("falls back to a dash when nothing identifies the target", () => {
    expect(formatRetirementTarget({ changeType: RETIRE_CHANGE_TYPE_SLUG, effectiveDate: "2026-12-01" })).toBe("—");
  });
});

describe("target details", () => {
  it("exposes the portfolio code and long name of the target configuration", () => {
    expect(getRetirementPortfolioCode(baseRequest)).toBe("HORRP");
    expect(getRetirementLongName(baseRequest)).toBe("Holdingmaatschappij Rijnland Portefeuille");
  });

  it("falls back to the staged fields and finally to a dash", () => {
    const fieldsOnly = {
      changeType: RETIRE_CHANGE_TYPE_SLUG,
      effectiveDate: "2026-12-01",
      fields: [{ fieldKey: "portfolio_code", istValue: "X", sollValue: "HORRP" }],
    };
    expect(getRetirementPortfolioCode(fieldsOnly)).toBe("HORRP");
    expect(getRetirementLongName(fieldsOnly)).toBe("—");
    expect(getRetirementPortfolioCode({ changeType: RETIRE_CHANGE_TYPE_SLUG, effectiveDate: "2026-12-01" })).toBe("—");
  });
});

describe("formatRetirementAuditMessage", () => {
  it("renders 'Retired portfolio configuration X effective Y' in Dutch UI text", () => {
    const message = formatRetirementAuditMessage(baseRequest);
    expect(message).toBe("Portefeuilleconfiguratie HOR-EQ-DEV-EIG beëindigd per 1 december 2026");
    // Sanity: the acceptance phrase components are all present
    expect(message).toContain("Portefeuilleconfiguratie");
    expect(message).toContain("HOR-EQ-DEV-EIG");
    expect(message).toContain("beëindigd per");
    expect(message).toContain("1 december 2026");
  });

  it("tolerates an unparseable effective date", () => {
    const message = formatRetirementAuditMessage({ ...baseRequest, effectiveDate: "niet-een-datum" });
    expect(message).toContain("niet-een-datum");
  });
});

describe("constants", () => {
  it("pins the retire slug, action type and Dutch title", () => {
    expect(RETIRE_CHANGE_TYPE_SLUG).toBe("portfolio_configuration_retire");
    expect(RETIRE_ACTION_TYPE).toBe("DELETE");
    expect(RETIRE_TITLE).toBe("Portefeuilleconfiguratie beëindigen");
  });
});
