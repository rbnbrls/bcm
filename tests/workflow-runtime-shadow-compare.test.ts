import { describe, expect, it } from "vitest";

import { DEFAULT_CHANGE_TYPE_CONFIGS } from "@/lib/db";
import type { IdentityContext } from "@/lib/identity/types";
import { compareLegacyChangeWithWorkflowShadow } from "@/lib/workflow-studio/shadow-compare";

const identity: IdentityContext = {
  userId: "change-manager",
  displayName: "Chris Change",
  groups: ["bcm:role:change_manager"],
  tenant: "tenant-a",
  businessUnit: "investments",
  sessionId: "session-1",
};

const scope = { tenant: "tenant-a", businessUnit: "investments", clientIds: ["client-a"] };

function config(slug: string) {
  const found = DEFAULT_CHANGE_TYPE_CONFIGS.find((item) => item.slug === slug);
  if (!found) throw new Error(`Missing config fixture ${slug}`);
  return found;
}

describe("workflow runtime shadow compare", () => {
  it("matches benchmark_switch form data, approvals, staging and apply plan", () => {
    const report = compareLegacyChangeWithWorkflowShadow({
      identity,
      scope,
      config: config("benchmark_switch"),
      formValues: {
        portfolio_id: "ADP*EQ*ROB",
        requested_benchmark_id: "MSCI-WORLD-NR",
      },
      fieldPairs: [
        { fieldKey: "current_benchmark_id", istValue: "AEX-GR", sollValue: "MSCI-WORLD-NR" },
        { fieldKey: "requested_benchmark_id", istValue: "AEX-GR", sollValue: "MSCI-WORLD-NR" },
      ],
      effectiveDate: "2026-09-01",
      rationale: "Nieuwe benchmark sluit beter aan op het mandaat.",
      classicApplyPlan: {
        resourceId: "portfolio_configuration",
        operation: "UPDATE",
        attributes: [{ attributeId: "benchmark_code", ist: "AEX-GR", soll: "MSCI-WORLD-NR" }],
      },
    });

    expect(report.status).toBe("equivalent");
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "form_data", status: "equivalent" }),
      expect.objectContaining({ name: "decisions", status: "equivalent" }),
      expect.objectContaining({ name: "staging", status: "equivalent" }),
      expect.objectContaining({ name: "apply_plan", status: "equivalent" }),
    ]));
    expect(report.issues).toEqual([]);
  });

  it("explains the fee_change apply-plan gap while preserving form data and approvals", () => {
    const report = compareLegacyChangeWithWorkflowShadow({
      identity,
      scope,
      config: config("fee_change"),
      formValues: {
        portfolio_id: "ADP*EQ*ROB",
        requested_fee: 0.42,
        fee_type: "management_fee",
      },
      fieldPairs: [
        { fieldKey: "current_fee", istValue: 0.38, sollValue: 0.42 },
        { fieldKey: "requested_fee", istValue: 0.38, sollValue: 0.42 },
        { fieldKey: "fee_type", istValue: "management_fee", sollValue: "management_fee" },
      ],
      effectiveDate: "2026-09-01",
      rationale: "Contractueel afgestemde tariefwijziging.",
      classicApplyPlan: {
        resourceId: "legacy_ist_sync",
        operation: "UPDATE",
        attributes: [{ attributeId: "fee", ist: 0.38, soll: 0.42 }],
      },
    });

    expect(report.status).toBe("explained_deviation");
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "form_data", status: "equivalent" }),
      expect.objectContaining({ name: "decisions", status: "equivalent" }),
      expect.objectContaining({ name: "apply_plan", status: "explained_deviation" }),
    ]));
    expect(JSON.stringify(report.checks)).toContain("Geen mutation-adapter");
  });
});
