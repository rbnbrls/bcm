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

// ── FlowStep-based fixture ────────────────────────────────────────────────

const benchmarkSwitchFlow: FlowStep[] = [
  {
    stepOrder: 1,
    stakeholder: "Aanvrager",
    stakeholderId: "requester",
    action: "Indienen change-verzoek",
    leadTime: "1 dag",
    description: "Indienen van het change-verzoek met alle benodigde informatie.",
  },
  {
    stepOrder: 2,
    stakeholder: "Portfoliomanager",
    stakeholderId: "portfolio_manager",
    action: "Beoordelen en goedkeuren",
    leadTime: "3 dagen",
    description: "Beoordeling van de aangevraagde wijziging door de portfoliomanager.",
  },
  {
    stepOrder: 3,
    stakeholder: "Eigen administratie",
    stakeholderId: "internal_admin",
    action: "Verwerken in administratie",
    leadTime: "2 dagen",
    description: "Verwerking van de wijziging in de eigen administratie.",
  },
  {
    stepOrder: 4,
    stakeholder: "Asset service provider",
    stakeholderId: "asset_svc_provider",
    action: "Uitvoeren bij ASP",
    leadTime: "5 dagen",
    description: "Uitvoering van de wijziging bij de asset service provider.",
  },
  {
    stepOrder: 5,
    stakeholder: "Portfoliomanager",
    stakeholderId: "portfolio_manager",
    action: "Eindcontrole",
    leadTime: "1 dag",
    description: "Eindcontrole en afronding door de portfoliomanager.",
  },
];

const singleStakeholderFlow: FlowStep[] = [
  {
    stepOrder: 1,
    stakeholder: "Administratie",
    stakeholderId: "admin",
    action: "Verwerken",
    leadTime: "2 dagen",
    description: "Verwerken in administratie.",
  },
  {
    stepOrder: 2,
    stakeholder: "Administratie",
    stakeholderId: "admin",
    action: "Controleren",
    leadTime: "1 dag",
    description: "Controleren van de verwerking.",
  },
];

const emptyFlow: FlowStep[] = [];

const flowWithMissingStakeholder: FlowStep[] = [
  {
    stepOrder: 1,
    stakeholder: "Admin",
    stakeholderId: "admin",
    action: "Stap 1",
    leadTime: "1 dag",
    description: "Eerste stap.",
  },
  {
    stepOrder: 2,
    stakeholder: "",
    stakeholderId: "",
    action: "Systeemvalidatie",
    leadTime: "—",
    description: "Interne systeemvalidatie zonder stakeholder.",
  },
  {
    stepOrder: 3,
    stakeholder: "Beoordelaar",
    stakeholderId: "reviewer",
    action: "Beoordelen",
    leadTime: "2 dagen",
    description: "Beoordeling door een reviewer.",
  },
];

// ── generateFlowMermaid tests ──────────────────────────────────────────────

describe("generateFlowMermaid", () => {
  it("should generate a flowchart LR definition with stakeholder subgraphs", () => {
    const result = generateFlowMermaid(benchmarkSwitchFlow, "Benchmarkwissel");

    expect(result).toContain("flowchart LR");
    // Should contain stakeholder subgraphs
    expect(result).toContain("subgraph sg0");
    expect(result).toContain("subgraph sg1");
    expect(result).toContain("subgraph sg2");
    // Should contain specific stakeholders
    expect(result).toContain("Aanvrager");
    expect(result).toContain("Portfoliomanager");
    expect(result).toContain("Eigen administratie");
    expect(result).toContain("Asset service provider");
  });

  it("should produce valid mermaid syntax with step nodes and sequential arrows", () => {
    const result = generateFlowMermaid(benchmarkSwitchFlow, "Benchmarkwissel");

    // Each step should appear as a node
    for (let i = 1; i <= 5; i++) {
      expect(result).toContain(`S${i}`);
    }
    // Sequential arrows between steps
    expect(result).toContain("S1 --> S2");
    expect(result).toContain("S2 --> S3");
    expect(result).toContain("S3 --> S4");
    expect(result).toContain("S4 --> S5");
  });

  it("should include step action text in node labels", () => {
    const result = generateFlowMermaid(benchmarkSwitchFlow, "Benchmarkwissel");

    expect(result).toContain("Indienen change-verzoek");
    expect(result).toContain("Beoordelen en goedkeuren");
    expect(result).toContain("Verwerken in administratie");
    expect(result).toContain("Uitvoeren bij ASP");
    expect(result).toContain("Eindcontrole");
  });

  it("should include lead time when available", () => {
    const result = generateFlowMermaid(benchmarkSwitchFlow, "Benchmarkwissel");

    expect(result).toContain("⏱ 1 dag");
    expect(result).toContain("⏱ 3 dagen");
    expect(result).toContain("⏱ 2 dagen");
    expect(result).toContain("⏱ 5 dagen");
  });

  it("should group steps by stakeholder into separate subgraphs", () => {
    const result = generateFlowMermaid(benchmarkSwitchFlow, "Benchmarkwissel");

    // Portfoliomanager has steps 2 and 5 — should be in the same subgraph
    expect(result).toContain("subgraph sg1");
    // Portfoliomanager should appear as subgraph label
    expect(result).toContain("Portfoliomanager");
    // Both steps of Portfoliomanager should be in the same subgraph
    // Step 2 = "Beoordelen en goedkeuren", step 5 = "Eindcontrole"
    expect(result).toContain("Beoordelen en goedkeuren");
    expect(result).toContain("Eindcontrole");
  });

  it("should handle a flow with a single stakeholder (all steps grouped together)", () => {
    const result = generateFlowMermaid(singleStakeholderFlow, "Test");

    expect(result).toContain("flowchart LR");
    expect(result).toContain("subgraph sg0");
    expect(result).toContain("Administratie");
    expect(result).toContain("S1 --> S2");
  });

  it("should handle an empty flow gracefully", () => {
    const result = generateFlowMermaid(emptyFlow, "Empty");

    expect(result).toContain("flowchart LR");
    // No subgraphs, no arrows
    expect(result).not.toContain("subgraph");
    expect(result).not.toContain("-->");
  });

  it("should apply different color styles per stakeholder group", () => {
    const result = generateFlowMermaid(benchmarkSwitchFlow, "Benchmarkwissel");

    // Should have classDef for each unique stakeholder
    expect(result).toContain("classDef stkh-0");
    expect(result).toContain("classDef stkh-1");
    expect(result).toContain("classDef stkh-2");
    expect(result).toContain("classDef stkh-3");
  });

  it("should escape double quotes in stakeholder names", () => {
    const flowWithQuotes: FlowStep[] = [
      {
        stepOrder: 1,
        stakeholder: 'Portfolio "Manager"',
        stakeholderId: "pm",
        action: "Review",
        leadTime: "1 dag",
        description: "",
      },
    ];
    const result = generateFlowMermaid(flowWithQuotes, "Test");

    // Quotes should be escaped (replaced with single quotes)
    expect(result).not.toContain('"Manager"');
    expect(result).toContain("Portfolio 'Manager'");
  });

  it("should suppress lead time display when lead time is em-dash", () => {
    const flowWithNoLeadTime: FlowStep[] = [
      {
        stepOrder: 1,
        stakeholder: "Admin",
        stakeholderId: "admin",
        action: "Automatische stap",
        leadTime: "—",
        description: "",
      },
    ];
    const result = generateFlowMermaid(flowWithNoLeadTime, "Test");

    expect(result).not.toContain("⏱");
  });

  it("should produce arrows in correct order even when steps span multiple stakeholders", () => {
    const result = generateFlowMermaid(benchmarkSwitchFlow, "Benchmarkwissel");

    // The arrows should follow stepOrder (1→2→3→4→5)
    const arrowLines = result
      .split("\n")
      .filter((l) => l.includes("-->") && !l.includes("classDef"))
      .map((l) => l.trim());

    // Last arrows should be S4 --> S5
    expect(arrowLines[arrowLines.length - 1]).toContain("S4 --> S5");
  });
});

// ── generateStakeholderFlowMermaid tests ───────────────────────────────────

describe("generateStakeholderFlowMermaid", () => {
  it("should filter out system steps (steps without stakeholderId)", () => {
    const result = generateStakeholderFlowMermaid(
      flowWithMissingStakeholder,
      "Test"
    );

    // Admin and Beoordelaar steps should be present
    expect(result).toContain("Stap 1");
    expect(result).toContain("Beoordelen");
    // The system validation (empty stakeholder) should be filtered out
    expect(result).not.toContain("Systeemvalidatie");
  });

  it("should maintain correct sequential order after filtering", () => {
    const result = generateStakeholderFlowMermaid(
      flowWithMissingStakeholder,
      "Test"
    );

    // After filtering, S1 (Admin) should connect to S3 (Beoordelaar)
    expect(result).toContain("S1 --> S3");
    // S2 (Systeemvalidatie) should NOT appear
    expect(result).not.toContain("S2");
  });

  it("should handle a flow with only stakeholder steps (no filtering needed)", () => {
    const result = generateStakeholderFlowMermaid(
      benchmarkSwitchFlow,
      "Benchmarkwissel"
    );

    // All steps have stakeholderId, so all should be present
    expect(result).toContain("S1");
    expect(result).toContain("S2");
    expect(result).toContain("S3");
    expect(result).toContain("S4");
    expect(result).toContain("S5");
    // Arrows should be present for all consecutive steps
    expect(result).toContain("S1 --> S2");
    expect(result).toContain("S4 --> S5");
  });

  it("should fall back to a 'no steps' placeholder when all steps are filtered out", () => {
    const allSystemSteps: FlowStep[] = [
      {
        stepOrder: 1,
        stakeholder: "",
        stakeholderId: "",
        action: "Systeemcheck",
        leadTime: "—",
        description: "",
      },
    ];
    const result = generateStakeholderFlowMermaid(allSystemSteps, "Test");

    // Should show the fallback message instead of steps
    expect(result).toContain("Geen processtappen beschikbaar");
    expect(result).not.toContain("Systeemcheck");
  });

  it("should fall back for empty flow", () => {
    const result = generateStakeholderFlowMermaid(emptyFlow, "Test");

    expect(result).toContain("Geen processtappen beschikbaar");
  });

  it("should preserve stakeholder subgraph grouping after filtering", () => {
    const result = generateStakeholderFlowMermaid(
      flowWithMissingStakeholder,
      "Test"
    );

    // Should still use subgraphs for remaining stakeholders
    expect(result).toContain("subgraph");
    // Admin should still be in a subgraph
    expect(result).toContain("Admin");
    // Beoordelaar should be in a subgraph
    expect(result).toContain("Beoordelaar");
  });
});
