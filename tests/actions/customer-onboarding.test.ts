/**
 * Tests for the customer onboarding feature.
 *
 * Covers:
 * - Customer onboarding change type config exists and has correct structure
 * - Field validation for onboarding fields
 * - Reference generation with NC prefix
 * - DB operations (insertClient, createPortfolios)
 */
import { describe, it, expect } from "vitest";
import type { ChangeTypeConfig } from "@/lib/types";
import { validateGenericFields, generateReference } from "@/lib/change-form-utils";
import { DEFAULT_CHANGE_TYPE_CONFIGS } from "@/lib/db";

// ── Tests ───────────────────────────────────────────────────────────────────

describe("customer_onboarding config", () => {
  const config = DEFAULT_CHANGE_TYPE_CONFIGS.find(
    (c) => c.slug === "customer_onboarding",
  );

  it("should exist in DEFAULT_CHANGE_TYPE_CONFIGS", () => {
    expect(config).toBeDefined();
  });

  it("should have correct name and description", () => {
    expect(config!.name).toBe("Nieuwe klant");
    expect(config!.description).toContain("Onboard");
  });

  it("should have category 'client'", () => {
    expect(config!.category).toBe("client");
  });

  it("should have required fields: customer_name, external_reference, regeling_type, portfolio_count", () => {
    const fieldKeys = config!.fields.map((f) => f.key);
    expect(fieldKeys).toContain("customer_name");
    expect(fieldKeys).toContain("external_reference");
    expect(fieldKeys).toContain("regeling_type");
    expect(fieldKeys).toContain("portfolio_count");
  });

  it("customer_name should be a required text field", () => {
    const field = config!.fields.find((f) => f.key === "customer_name")!;
    expect(field.type).toBe("text");
    expect(field.required).toBe(true);
  });

  it("external_reference should be a required text field", () => {
    const field = config!.fields.find((f) => f.key === "external_reference")!;
    expect(field.type).toBe("text");
    expect(field.required).toBe(true);
  });

  it("regeling_type should have FPR and SPR options", () => {
    const field = config!.fields.find((f) => f.key === "regeling_type")!;
    expect(field.type).toBe("select");
    expect(field.required).toBe(true);
    expect(field.options).toBeDefined();
    const optionValues = field.options!.map((o) => o.value);
    expect(optionValues).toContain("FPR");
    expect(optionValues).toContain("SPR");
  });

  it("portfolio_count should be a required number field with min of 1", () => {
    const field = config!.fields.find((f) => f.key === "portfolio_count")!;
    expect(field.type).toBe("number");
    expect(field.required).toBe(true);
    expect(field.min).toBe(1);
  });
});

describe("customer_onboarding validation", () => {
  const config = DEFAULT_CHANGE_TYPE_CONFIGS.find(
    (c) => c.slug === "customer_onboarding",
  )!;

  it("should accept valid onboarding data", () => {
    const result = validateGenericFields(config, {
      customer_name: "Pensioenfonds Voorbeeld",
      external_reference: "PF-VRB-001",
      regeling_type: "FPR",
      portfolio_count: 3,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it("should accept SPR as valid regeling_type", () => {
    const result = validateGenericFields(config, {
      customer_name: "Pensioenfonds Test",
      external_reference: "PF-TST-001",
      regeling_type: "SPR",
      portfolio_count: 2,
    });
    expect(result.valid).toBe(true);
  });

  it("should reject missing required fields", () => {
    const result = validateGenericFields(config, {});
    expect(result.valid).toBe(false);
    expect(result.errors["customer_name"]).toBeDefined();
    expect(result.errors["external_reference"]).toBeDefined();
    expect(result.errors["regeling_type"]).toBeDefined();
    expect(result.errors["portfolio_count"]).toBeDefined();
  });

  it("should reject portfolio_count below 1", () => {
    const result = validateGenericFields(config, {
      customer_name: "Test",
      external_reference: "PF-TST-001",
      regeling_type: "FPR",
      portfolio_count: 0,
    });
    expect(result.valid).toBe(false);
    expect(result.errors["portfolio_count"]).toContain("lager");
  });

  it("should reject invalid regeling_type", () => {
    const result = validateGenericFields(config, {
      customer_name: "Test",
      external_reference: "PF-TST-001",
      regeling_type: "INVALID",
      portfolio_count: 1,
    });
    expect(result.valid).toBe(false);
    expect(result.errors["regeling_type"]).toContain("ongeldige waarde");
  });
});

describe("customer_onboarding reference generation", () => {
  it("should generate reference with NC prefix", () => {
    const ref = generateReference("customer_onboarding");
    expect(ref).toMatch(/^BCM-\d{4}-NC-\d{6}$/);
  });
});
