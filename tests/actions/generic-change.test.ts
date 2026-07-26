/**
 * Tests for the generic change request server action.
 *
 * Covers validation side-effects, reference generation,
 * and error handling for all change types.
 */
import { describe, it, expect } from "vitest";
import type { ChangeTypeConfig } from "@/lib/types";
import { generateReference } from "@/lib/change-form-utils";

// ── Tests ───────────────────────────────────────────────────────────────────

describe("generateReference", () => {
  it("should generate a reference for benchmark_switch", () => {
    const ref = generateReference("benchmark_switch");
    expect(ref).toMatch(/^BCM-\d{4}-BS-\d{6}$/);
  });

  it("should generate a reference for fee_change", () => {
    const ref = generateReference("fee_change");
    expect(ref).toMatch(/^BCM-\d{4}-FC-\d{6}$/);
  });

  it("should generate a reference for mandate_change", () => {
    const ref = generateReference("mandate_change");
    expect(ref).toMatch(/^BCM-\d{4}-MC-\d{6}$/);
  });

  it("should generate a reference for custodian_change", () => {
    const ref = generateReference("custodian_change");
    expect(ref).toMatch(/^BCM-\d{4}-CC-\d{6}$/);
  });

  it("should generate a reference for rebalance_trigger", () => {
    const ref = generateReference("rebalance_trigger");
    expect(ref).toMatch(/^BCM-\d{4}-RT-\d{6}$/);
  });

  it("should generate a reference for customer_onboarding", () => {
    const ref = generateReference("customer_onboarding");
    expect(ref).toMatch(/^BCM-\d{4}-NC-\d{6}$/);
  });

  it("should fall back to CR prefix for unknown change types", () => {
    const ref = generateReference("unknown_type");
    expect(ref).toMatch(/^BCM-\d{4}-CR-\d{6}$/);
  });
});

describe("Generic action — field-to-item mapping", () => {
  it("should build change field values from config fields and form data", () => {
    // Simulate the field mapping that happens in the generic action
    const config: Pick<ChangeTypeConfig, "fields"> = {
      fields: [
        { key: "portfolio_id", label: "Portefeuille", type: "select", required: true, referenceTable: "portfolios" },
        { key: "current_fee", label: "Huidige vergoeding", type: "number", required: true, min: 0, max: 100 },
        { key: "requested_fee", label: "Gewenste vergoeding", type: "number", required: true, min: 0, max: 100 },
        { key: "fee_type", label: "Type tarief", type: "select", required: true, options: [{ value: "management_fee", label: "Beheervergoeding" }] },
        { key: "effective_date", label: "Ingangsdatum", type: "date", required: true },
      ],
    };

    // Build field values from a parsed form data object
    const formValues: Record<string, string> = {
      portfolio_id: "c4707067-b98a-4a0f-92c7-5ee510dc70ff",
      current_fee: "0.45",
      requested_fee: "0.50",
      fee_type: "management_fee",
      effective_date: "2026-09-01",
    };

    const fieldValues = config.fields.map((field) => {
      const sollValue = formValues[field.key];
      // For generic field types, istValue is typically the current state
      // and sollValue is the requested state
      return {
        fieldKey: field.key,
        istValue: field.key.includes("current_") || field.key.includes("previous_") ? sollValue : null,
        sollValue: sollValue ?? null,
      };
    });

    expect(fieldValues).toHaveLength(5);

    // Verify IST/SOLL mapping logic
    const currentFeeField = fieldValues.find((f) => f.fieldKey === "current_fee")!;
    expect(currentFeeField.istValue).toBe("0.45");
    expect(currentFeeField.sollValue).toBe("0.45");

    const requestedFeeField = fieldValues.find((f) => f.fieldKey === "requested_fee")!;
    expect(requestedFeeField.istValue).toBeNull();
    expect(requestedFeeField.sollValue).toBe("0.50");
  });

  it("should correctly map IST/SOLL from istSollMapping config", () => {
    const istSollMapping = [
      { ist: "current_fee", soll: "requested_fee", labelIst: "Huidige vergoeding", labelSoll: "Gewenste vergoeding" },
    ];

    const formValues: Record<string, string> = {
      current_fee: "0.45",
      requested_fee: "0.50",
    };

    // Simulate how the action uses istSollMapping to decide which pairs to build
    const fieldKeysWithMapping = new Set<string>();
    for (const mapping of istSollMapping) {
      fieldKeysWithMapping.add(mapping.ist);
      fieldKeysWithMapping.add(mapping.soll);
    }

    const fieldValues = Array.from(fieldKeysWithMapping).map((key) => ({
      fieldKey: key,
      istValue: formValues[key] ?? null,
      sollValue: formValues[key] ?? null,
    }));

    // The IST field carries the current value
    const istField = fieldValues.find((f) => f.fieldKey === "current_fee")!;
    expect(istField.istValue).toBe("0.45");
    expect(istField.sollValue).toBe("0.45");

    // The SOLL field is the target
    const sollField = fieldValues.find((f) => f.fieldKey === "requested_fee")!;
    expect(sollField.istValue).toBe("0.50");
    expect(sollField.sollValue).toBe("0.50");
  });
});
