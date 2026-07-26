/**
 * Tests for the change type catalog utilities.
 *
 * Covers:
 * - Mermaid flowchart generation from ChangeTypeConfig
 * - Catalog sorting and filtering
 */
import { describe, it, expect } from "vitest";
import type { ChangeTypeConfig } from "@/lib/types";
import {
  generateMermaidFlowchart,
  sortChangeTypes,
  getActiveChangeTypes,
} from "@/lib/change-type-catalog";

// ── Fixtures ────────────────────────────────────────────────────────────────

const benchmarkSwitchConfig: ChangeTypeConfig = {
  id: "00000000-0000-0000-0000-000000000001",
  slug: "benchmark_switch",
  name: "Benchmarkwissel",
  description: "Wijzig de benchmark van een of meerdere portefeuilles.",
  category: "benchmark",
  fields: [],
  istSollMapping: [],
  cost: { baseCost: 0, costCurrency: "EUR", perItemCost: 500, description: "€ 500 per portefeuille" },
  defaultLeadDays: 7,
  stakeholders: [
    { id: "internal_admin", name: "Eigen administratie", role: "Administratie", notifyOn: ["on_submit", "on_approval"], mandatory: true, contactType: "webhook" },
    { id: "asset_service_provider", name: "Asset service provider", role: "Portefeuilleadministratie", notifyOn: ["on_approval"], mandatory: true, contactType: "webhook" },
    { id: "factset", name: "FactSet", role: "Performancemeting", notifyOn: ["on_completion"], mandatory: false, contactType: "webhook" },
  ],
  workflow: "benchmark_switch",
  active: true,
  sortOrder: 10,
  createdAt: "",
  updatedAt: "",
};

const feeChangeConfig: ChangeTypeConfig = {
  id: "00000000-0000-0000-0000-000000000003",
  slug: "fee_change",
  name: "Tariefwijziging",
  description: "Wijzig de beheervergoeding of servicetarieven van een portefeuille.",
  category: "fee",
  fields: [],
  istSollMapping: [],
  cost: { baseCost: 2500, costCurrency: "EUR", perItemCost: 500, description: "€ 2.500 + € 500 pp" },
  defaultLeadDays: 30,
  stakeholders: [],
  workflow: "fee_change",
  active: true,
  sortOrder: 30,
  createdAt: "",
  updatedAt: "",
};

const inactiveConfig: ChangeTypeConfig = {
  id: "00000000-0000-0000-0000-000000000099",
  slug: "inactive_type",
  name: "Inactief type",
  description: "This should not appear in the catalog.",
  category: "other",
  fields: [],
  istSollMapping: [],
  cost: { baseCost: 0, costCurrency: "EUR", description: "" },
  defaultLeadDays: 1,
  stakeholders: [],
  workflow: "default",
  active: false,
  sortOrder: 999,
  createdAt: "",
  updatedAt: "",
};

const custodianChangeConfig: ChangeTypeConfig = {
  id: "00000000-0000-0000-0000-000000000005",
  slug: "custodian_change",
  name: "Custodianwijziging",
  description: "Wijzig de custodian (bewaarnemer) voor een of meerdere portefeuilles.",
  category: "custodian",
  fields: [],
  istSollMapping: [],
  cost: { baseCost: 5000, costCurrency: "EUR", perItemCost: 1500, description: "€ 5.000 + € 1.500 pp" },
  defaultLeadDays: 60,
  stakeholders: [
    { id: "portfolio_manager", name: "Portfoliomanager", role: "Beslisser", notifyOn: ["on_submit"], mandatory: true, contactType: "email" },
    { id: "custodian_transition", name: "Custodian transitieteam", role: "Uitvoering", notifyOn: ["on_approval"], mandatory: true, contactType: "email" },
    { id: "legal_compliance", name: "Legal & Compliance", role: "Contracttoetsing", notifyOn: ["on_submit"], mandatory: true, contactType: "email" },
    { id: "internal_admin", name: "Eigen administratie", role: "Administratie", notifyOn: ["on_approval", "on_completion"], mandatory: true, contactType: "webhook" },
  ],
  workflow: "custodian_change",
  active: true,
  sortOrder: 50,
  createdAt: "",
  updatedAt: "",
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe("generateMermaidFlowchart", () => {
  it("should generate a flowchart with standard workflow nodes for a change type", () => {
    const result = generateMermaidFlowchart(benchmarkSwitchConfig);

    expect(result).toContain("flowchart LR");
    // Standard workflow nodes should be present
    expect(result).toContain("Aanvraag");
    expect(result).toContain("Goedkeuring");
    expect(result).toContain("Uitvoering");
    expect(result).toContain("Gereed");
  });

  it("should include stakeholders as sub-nodes in the flowchart", () => {
    const result = generateMermaidFlowchart(benchmarkSwitchConfig);

    // Stakeholders should appear in the diagram
    expect(result).toContain("Eigen administratie");
    expect(result).toContain("Asset service provider");
    expect(result).toContain("FactSet");
  });

  it("should produce valid mermaid syntax (flowchart LR with arrows)", () => {
    const result = generateMermaidFlowchart(benchmarkSwitchConfig);

    // Should have flow arrows
    expect(result).toContain("-->");
    // Should have dotted lines for stakeholders
    expect(result).toContain("-.-");
    // Should have node definitions (text in brackets)
    expect(result).toContain("[");
    expect(result).toContain("]");
  });

  it("should handle a change type with no stakeholders gracefully", () => {
    const result = generateMermaidFlowchart(feeChangeConfig);

    expect(result).toContain("flowchart LR");
    expect(result).toContain("Aanvraag");
    expect(result).toContain("Goedkeuring");
    expect(result).toContain("Uitvoering");
    expect(result).toContain("Gereed");
    // No stakeholder sub-nodes
    expect(result).not.toContain("-.->");
  });

  it("should include the change type name in the diagram", () => {
    const result = generateMermaidFlowchart(benchmarkSwitchConfig);

    expect(result).toContain("Benchmarkwissel");
  });

  it("should show correct stakeholder notification points in the workflow", () => {
    const result = generateMermaidFlowchart(custodianChangeConfig);

    // Custodian has 3 stakeholders with different notifyOn triggers
    expect(result).toContain("Portfoliomanager");
    expect(result).toContain("Custodian transitieteam");
    expect(result).toContain("Legal & Compliance");
  });
});

describe("sortChangeTypes", () => {
  it("should sort change types by sortOrder ascending", () => {
    const sorted = sortChangeTypes([feeChangeConfig, benchmarkSwitchConfig]);

    expect(sorted[0].slug).toBe("benchmark_switch"); // sortOrder 10
    expect(sorted[1].slug).toBe("fee_change"); // sortOrder 30
  });

  it("should return an empty array when given an empty array", () => {
    expect(sortChangeTypes([])).toEqual([]);
  });

  it("should not mutate the original array", () => {
    const original = [feeChangeConfig, benchmarkSwitchConfig];
    const copy = [...original];
    sortChangeTypes(original);
    expect(original).toEqual(copy);
  });
});

describe("getActiveChangeTypes", () => {
  it("should filter out inactive change types", () => {
    const result = getActiveChangeTypes([benchmarkSwitchConfig, inactiveConfig]);

    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("benchmark_switch");
  });

  it("should return all types when all are active", () => {
    const result = getActiveChangeTypes([benchmarkSwitchConfig, feeChangeConfig]);

    expect(result).toHaveLength(2);
  });

  it("should return empty array when there are no active types", () => {
    const result = getActiveChangeTypes([inactiveConfig]);

    expect(result).toHaveLength(0);
  });
});
