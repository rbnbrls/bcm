/**
 * Tests for the change type catalog utilities.
 *
 * Covers:
 * - Mermaid flowchart generation from ChangeTypeConfig
 * - Catalog sorting and filtering
 */
import { describe, it, expect } from "vitest";
import type { ChangeTypeConfig, FlowStep } from "@/lib/types";
import {
  generateMermaidFlowchart,
  generateFlowMermaid,
  generateStakeholderFlowMermaid,
  sortChangeTypes,
  getActiveChangeTypes,
  resolveChangeTypeFormKind,
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

// ── FlowStep fixtures (for generateFlowMermaid) ──────────────────────────────

const benchmarkSwitchFlow: FlowStep[] = [
  { stepOrder: 1, stakeholder: "Interne administratie", stakeholderId: "internal_admin", action: "Aanvraag indienen", leadTime: "1 werkdag", description: "Interne administratie stelt de benchmarkwissel op en dient de aanvraag in." },
  { stepOrder: 2, stakeholder: "Asset service provider", stakeholderId: "asset_service", action: "Controleren en accorderen", leadTime: "3 werkdagen", description: "ASP controleert de aangevraagde wijziging en accordeert deze." },
  { stepOrder: 3, stakeholder: "Asset service provider", stakeholderId: "asset_service", action: "Uitvoeren benchmarkwissel", leadTime: "2 werkdagen", description: "ASP voert de benchmarkwissel door in de systemen." },
  { stepOrder: 4, stakeholder: "FactSet", stakeholderId: "factset", action: "Verwerken en bevestigen", leadTime: "1 werkdag", description: "FactSet verwerkt de wijziging." },
  { stepOrder: 5, stakeholder: "Interne administratie", stakeholderId: "internal_admin", action: "Gereedmelding", leadTime: "\u2014", description: "Interne administratie meldt de change gereed." },
];

const unsortedFlow: FlowStep[] = [
  { stepOrder: 3, stakeholder: "ASP", stakeholderId: "asp", action: "Uitvoeren", leadTime: "2 dagen", description: "" },
  { stepOrder: 1, stakeholder: "Admin", stakeholderId: "admin", action: "Aanvraag", leadTime: "1 dag", description: "" },
  { stepOrder: 2, stakeholder: "ASP", stakeholderId: "asp", action: "Accorderen", leadTime: "3 dagen", description: "" },
];

const singleStepFlow: FlowStep[] = [
  { stepOrder: 1, stakeholder: "Admin", stakeholderId: "admin", action: "Enige stap", leadTime: "1 dag", description: "" },
];

const emptyFlow: FlowStep[] = [];

// ── FlowStep fixtures (for generateStakeholderFlowMermaid) ────────────────────

const mixedStepsFlow: FlowStep[] = [
  { stepOrder: 1, stakeholder: "Interne administratie", stakeholderId: "internal_admin", action: "Aanvraag indienen", leadTime: "1 werkdag", description: "" },
  { stepOrder: 2, stakeholder: "", stakeholderId: "", action: "Systeemvalidatie", leadTime: "", description: "" },
  { stepOrder: 3, stakeholder: "ASP", stakeholderId: "asp", action: "Controleren", leadTime: "2 werkdagen", description: "" },
];

const onlySystemStepsFlow: FlowStep[] = [
  { stepOrder: 1, stakeholder: "", stakeholderId: "", action: "Systeemcontrole", leadTime: "", description: "" },
  { stepOrder: 2, stakeholder: "  ", stakeholderId: "   ", action: "Nog een systeemstap", leadTime: "", description: "" },
];

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

describe("resolveChangeTypeFormKind", () => {
  it("maps portfolio_addition to the create wizard (backward compatibility)", () => {
    expect(resolveChangeTypeFormKind("portfolio_addition")).toBe("portfolio-create");
  });

  it("maps portfolio_configuration_create to the create wizard", () => {
    expect(resolveChangeTypeFormKind("portfolio_configuration_create")).toBe("portfolio-create");
  });

  it("maps client_onboarding to the onboarding wizard", () => {
    expect(resolveChangeTypeFormKind("client_onboarding")).toBe("client-onboarding");
  });

  it("maps portfolio_configuration_update to the generic form", () => {
    expect(resolveChangeTypeFormKind("portfolio_configuration_update")).toBe("generic");
  });

  it("maps portfolio_configuration_retire to the generic form", () => {
    expect(resolveChangeTypeFormKind("portfolio_configuration_retire")).toBe("generic");
  });

  it("maps lookup-addition types to their dedicated request forms", () => {
    expect(resolveChangeTypeFormKind("new_asset_class")).toBe("asset-class-request");
    expect(resolveChangeTypeFormKind("new_sub_asset_class")).toBe("sub-asset-class-request");
  });

  it("falls back to the generic form for unknown types", () => {
    expect(resolveChangeTypeFormKind("benchmark_switch")).toBe("generic");
    expect(resolveChangeTypeFormKind("fee_change")).toBe("generic");
  });

  it("falls back to the generic form when no type is preselected", () => {
    expect(resolveChangeTypeFormKind(undefined)).toBe("generic");
  });
});

describe("generateFlowMermaid", () => {
  it("should produce valid mermaid syntax (flowchart LR)", () => {
    const result = generateFlowMermaid(benchmarkSwitchFlow, "Benchmarkwissel");

    expect(result).toContain("flowchart LR");
  });

  it("should include all steps ordered by stepOrder", () => {
    const result = generateFlowMermaid(benchmarkSwitchFlow, "Benchmarkwissel");

    expect(result).toContain("Aanvraag indienen");
    expect(result).toContain("Controleren en accorderen");
    expect(result).toContain("Uitvoeren benchmarkwissel");
    expect(result).toContain("Verwerken en bevestigen");
    expect(result).toContain("Gereedmelding");
  });

  it("should group steps by stakeholder in subgraphs", () => {
    const result = generateFlowMermaid(benchmarkSwitchFlow, "Benchmarkwissel");

    // Subgraph labels should contain stakeholder names
    expect(result).toContain("subgraph sg");
    expect(result).toContain("Interne administratie");
    expect(result).toContain("Asset service provider");
    expect(result).toContain("FactSet");
  });

  it("should include sequential arrows connecting all steps", () => {
    const result = generateFlowMermaid(benchmarkSwitchFlow, "Benchmarkwissel");

    // There are 5 steps → 4 arrows
    expect(result).toContain("S1 --> S2");
    expect(result).toContain("S2 --> S3");
    expect(result).toContain("S3 --> S4");
    expect(result).toContain("S4 --> S5");
  });

  it("should include lead time info when present", () => {
    const result = generateFlowMermaid(benchmarkSwitchFlow, "Benchmarkwissel");

    expect(result).toContain("1 werkdag");
    expect(result).toContain("3 werkdagen");
    expect(result).toContain("2 werkdagen");
  });

  it("should handle em-dash lead time gracefully (no duration shown)", () => {
    const result = generateFlowMermaid(benchmarkSwitchFlow, "Benchmarkwissel");

    // The em-dash lead time step (Gereedmelding) should still appear
    expect(result).toContain("Gereedmelding");
  });

  it("should sort steps correctly when input is not in order", () => {
    const result = generateFlowMermaid(unsortedFlow, "Test");

    // Arrows should follow stepOrder, not input order
    expect(result).toContain("S1 --> S2");
    expect(result).toContain("S2 --> S3");
    // S3 should not be connected before S1
    expect(result.indexOf("S1 --> S2")).toBeLessThan(result.indexOf("S2 --> S3"));
  });

  it("should handle a single step flow (no arrows)", () => {
    const result = generateFlowMermaid(singleStepFlow, "Single");

    expect(result).toContain("flowchart LR");
    expect(result).toContain("Enige stap");
    // No arrows for a single step (no S1 --> S2 etc.)
    expect(result).not.toMatch(/S\d --> S\d/);
  });

  it("should accept changeTypeName parameter without embedding (used in page HTML)", () => {
    const result = generateFlowMermaid(benchmarkSwitchFlow, "Benchmarkwissel");

    // The name is passed for page-level rendering, not embedded in mermaid syntax
    expect(result).toContain("flowchart LR");
    expect(result).toContain("S1 --> S2");
  });

  it("should produce valid mermaid node syntax (text in brackets)", () => {
    const result = generateFlowMermaid(benchmarkSwitchFlow, "Benchmarkwissel");

    expect(result).toContain("[");
    expect(result).toContain("]");
    expect(result).toContain('"<strong>');
  });

  it("should include classDef style definitions for each stakeholder", () => {
    const result = generateFlowMermaid(benchmarkSwitchFlow, "Benchmarkwissel");

    expect(result).toContain("classDef stkh-0");
    expect(result).toContain("classDef stkh-1");
    expect(result).toContain("classDef stkh-2");
  });
});

describe("generateStakeholderFlowMermaid", () => {
  it("should filter out system steps without stakeholder", () => {
    const result = generateStakeholderFlowMermaid(mixedStepsFlow, "Test");

    // Stakeholder steps should be included
    expect(result).toContain("Aanvraag indienen");
    expect(result).toContain("Controleren");
    // System step should be filtered out
    expect(result).not.toContain("Systeemvalidatie");
  });

  it("should keep correct sequential order after filtering", () => {
    const result = generateStakeholderFlowMermaid(mixedStepsFlow, "Test");

    // After filtering out step 2, step 1 and 3 should be connected in order
    expect(result).toContain("S1 --> S3");
  });

  it("should fall back gracefully when all steps are system steps", () => {
    const result = generateStakeholderFlowMermaid(onlySystemStepsFlow, "Test");

    // Should produce a fallback message (no crash)
    expect(result).toContain("flowchart LR");
    expect(result).toContain("Geen processtappen beschikbaar");
  });

  it("should return valid mermaid syntax", () => {
    const result = generateStakeholderFlowMermaid(mixedStepsFlow, "Test");

    expect(result).toContain("flowchart LR");
    expect(result).toContain("subgraph sg");
    expect(result).toContain("-->");
  });

  it("should include stakeholder subgraphs with step nodes", () => {
    const result = generateStakeholderFlowMermaid(benchmarkSwitchFlow, "Benchmarkwissel");

    expect(result).toContain("Interne administratie");
    expect(result).toContain("Asset service provider");
    expect(result).toContain("FactSet");
    expect(result).toContain("Aanvraag indienen");
    expect(result).toContain("Uitvoeren benchmarkwissel");
  });
});
