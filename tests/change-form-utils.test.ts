/**
 * Tests for the generic change form utilities.
 *
 * Covers:
 * - Field validation against ChangeTypeConfig field definitions
 * - Cost computation based on config cost model
 * - SLA/lead-time computation
 * - Field value coercion and defaults
 */
import { describe, it, expect, vi } from "vitest";
import type { ChangeTypeConfig, ChangeFieldValue } from "@/lib/types";
import { validateGenericFields, computeEstimatedCost, generateReference } from "@/lib/change-form-utils";

// ── Fixtures ────────────────────────────────────────────────────────────────

const feeChangeConfig: ChangeTypeConfig = {
  id: "00000000-0000-0000-0000-000000000003",
  slug: "fee_change",
  name: "Tariefwijziging",
  description: "Wijzig de beheervergoeding of servicetarieven van een portefeuille.",
  category: "fee",
  fields: [
    { key: "portfolio_id", label: "Portefeuille", type: "select", required: true, referenceTable: "portfolios" },
    { key: "current_fee", label: "Huidige vergoeding", type: "number", required: true, min: 0, max: 100 },
    { key: "requested_fee", label: "Gewenste vergoeding", type: "number", required: true, min: 0, max: 100 },
    { key: "fee_type", label: "Type tarief", type: "select", required: true, options: [
      { value: "management_fee", label: "Beheervergoeding" },
      { value: "service_fee", label: "Servicetarief" },
    ]},
    { key: "effective_date", label: "Ingangsdatum", type: "date", required: true },
    { key: "rationale", label: "Toelichting", type: "longtext", required: false, maxLength: 2000 },
  ],
  istSollMapping: [{ ist: "current_fee", soll: "requested_fee", labelIst: "Huidig", labelSoll: "Gewenst" }],
  cost: { baseCost: 2500, costCurrency: "EUR", perItemCost: 500, description: "€ 2.500 + € 500 pp" },
  defaultLeadDays: 30,
  stakeholders: [],
  workflow: "fee_change",
  active: true,
  sortOrder: 30,
  createdAt: "",
  updatedAt: "",
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe("validateGenericFields", () => {
  it("should accept valid field values", () => {
    const result = validateGenericFields(feeChangeConfig, {
      portfolio_id: "c4707067-b98a-4a0f-92c7-5ee510dc70ff",
      current_fee: 0.45,
      requested_fee: 0.5,
      fee_type: "management_fee",
      effective_date: "2026-09-01",
      rationale: "Marktconforme aanpassing van het beheertarief.",
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it("should reject missing required fields", () => {
    const result = validateGenericFields(feeChangeConfig, {
      portfolio_id: "",
      current_fee: undefined,
    });
    expect(result.valid).toBe(false);
    expect(result.errors["portfolio_id"]).toBeDefined();
    expect(result.errors["current_fee"]).toBeDefined();
    expect(result.errors["requested_fee"]).toBeDefined();
    expect(result.errors["fee_type"]).toBeDefined();
    expect(result.errors["effective_date"]).toBeDefined();
  });

  it("should reject number fields below minimum", () => {
    const result = validateGenericFields(feeChangeConfig, {
      portfolio_id: "test-uuid",
      current_fee: -1,
      requested_fee: 0.5,
      fee_type: "management_fee",
      effective_date: "2026-09-01",
    });
    expect(result.valid).toBe(false);
    expect(result.errors["current_fee"]).toContain("lager");
  });

  it("should reject invalid date format", () => {
    const result = validateGenericFields(feeChangeConfig, {
      portfolio_id: "test-uuid",
      current_fee: 0.45,
      requested_fee: 0.5,
      fee_type: "management_fee",
      effective_date: "01-09-2026", // wrong format
    });
    expect(result.valid).toBe(false);
    expect(result.errors["effective_date"]).toContain("datum");
  });

  it("should reject select fields with invalid options", () => {
    const result = validateGenericFields(feeChangeConfig, {
      portfolio_id: "test-uuid",
      current_fee: 0.45,
      requested_fee: 0.5,
      fee_type: "nonexistent_option",
      effective_date: "2026-09-01",
    });
    expect(result.valid).toBe(false);
    expect(result.errors["fee_type"]).toContain("ongeldige waarde");
  });

  it("should accept optional fields as undefined or empty", () => {
    const result = validateGenericFields(feeChangeConfig, {
      portfolio_id: "test-uuid",
      current_fee: 0.45,
      requested_fee: 0.5,
      fee_type: "management_fee",
      effective_date: "2026-09-01",
      rationale: "", // optional field
    });
    expect(result.valid).toBe(true);
  });

  it("should validate text and longtext fields against maxLength", () => {
    const longText = "a".repeat(2001);
    const result = validateGenericFields(feeChangeConfig, {
      portfolio_id: "test-uuid",
      current_fee: 0.45,
      requested_fee: 0.5,
      fee_type: "management_fee",
      effective_date: "2026-09-01",
      rationale: longText,
    });
    expect(result.valid).toBe(false);
    expect(result.errors["rationale"]).toContain("2000");
  });

  it("should validate text-type fields (e.g. fee_type has options)", () => {
    // fee_type has options, so an invalid option should still be caught
    const result = validateGenericFields(feeChangeConfig, {
      portfolio_id: "test-uuid",
      current_fee: 0.45,
      requested_fee: 0.5,
      fee_type: "invalid_option",
      effective_date: "2026-09-01",
    });
    expect(result.valid).toBe(false);
    expect(result.errors["fee_type"]).toContain("ongeldige waarde");
  });

  it("should handle number fields that are passed as strings", () => {
    const result = validateGenericFields(feeChangeConfig, {
      portfolio_id: "test-uuid",
      current_fee: "0.45",
      requested_fee: "0.50",
      fee_type: "management_fee",
      effective_date: "2026-09-01",
    });
    expect(result.valid).toBe(true);
  });
});

describe("computeEstimatedCost", () => {
  it("should compute base cost for zero items", () => {
    const result = computeEstimatedCost(feeChangeConfig, 0);
    expect(result.cost).toBe(2500);
    expect(result.currency).toBe("EUR");
  });

  it("should add per-item cost for multiple items", () => {
    const result = computeEstimatedCost(feeChangeConfig, 3);
    expect(result.cost).toBe(2500 + 3 * 500); // 4000
  });

  it("should handle configs without perItemCost", () => {
    const simpleConfig: ChangeTypeConfig = {
      ...feeChangeConfig,
      cost: { baseCost: 5000, costCurrency: "EUR", description: "Fixed" },
    };
    const result = computeEstimatedCost(simpleConfig, 5);
    expect(result.cost).toBe(5000); // no per-item addition
  });

  it("should return the description from the config", () => {
    const result = computeEstimatedCost(feeChangeConfig, 1);
    expect(result.description).toBe("€ 2.500 + € 500 pp");
  });
});

describe("generateReference", () => {
  it("keeps the legacy portfolio_addition prefix (NP) for backward compatibility", () => {
    expect(generateReference("portfolio_addition")).toMatch(/^BCM-\d{4}-NP-\d{6}$/);
  });

  it("uses the create prefix for portfolio_configuration_create (same wizard family)", () => {
    expect(generateReference("portfolio_configuration_create")).toMatch(/^BCM-\d{4}-NP-\d{6}$/);
  });

  it("uses distinct prefixes for update and retire lifecycle types", () => {
    expect(generateReference("portfolio_configuration_update")).toMatch(/^BCM-\d{4}-PU-\d{6}$/);
    expect(generateReference("portfolio_configuration_retire")).toMatch(/^BCM-\d{4}-PR-\d{6}$/);
  });

  it("falls back to CR for unknown slugs", () => {
    expect(generateReference("unknown_slug")).toMatch(/^BCM-\d{4}-CR-\d{6}$/);
  });

  it("returns distinct references for submissions in the same millisecond (parallel race)", () => {
    // Two change requests submitted within the same ms used to get the same
    // reference (suffix = last 6 digits of Date.now()), violating the unique
    // change_requests_reference_key constraint and failing one of the two
    // parallel submissions (observed in the @db e2e run).
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1785760297031);
    try {
      const first = generateReference("client_onboarding");
      const second = generateReference("client_onboarding");
      expect(first).not.toBe(second);
      expect(first).toMatch(/^BCM-\d{4}-CO-\d{6}$/);
      expect(second).toMatch(/^BCM-\d{4}-CO-\d{6}$/);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
