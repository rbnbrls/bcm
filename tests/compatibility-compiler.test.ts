import { describe, expect, it } from "vitest";
import type { IdentityContext } from "@/lib/identity/types";
import type { ChangeTypeConfig } from "@/lib/types";
import { blockRegistry } from "@/lib/workflow-studio/block-registry";
import { clientConfigDataCatalog } from "@/lib/workflow-studio/data-catalog";
import {
  compileLegacyChangeType,
  createCompatibilityCompiler,
  type CompatibilityCompileResult,
} from "@/lib/workflow-studio/compatibility-compiler";
import { WorkflowValidator } from "@/lib/workflow-studio/workflow-validator";

function buildBlockCatalog(): ReadonlyMap<string, ReturnType<typeof blockRegistry.contracts.resolve> extends { valid: true; value: infer V } ? V : never> {
  const map = new Map<string, never>();
  for (const entry of blockRegistry.listForIdentity({
    userId: "*",
    displayName: "*",
    groups: ["bcm:role:change_manager"],
    tenant: "*",
    businessUnit: "*",
    sessionId: "*",
  })) {
    const resolved = blockRegistry.contracts.resolve({ blockType: entry.blockType, contractVersion: entry.contractVersion });
    if (resolved.valid) map.set(entry.blockType, resolved.value as never);
  }
  return map;
}

const blockCatalog = buildBlockCatalog();
const validator = new WorkflowValidator(blockCatalog, clientConfigDataCatalog);

function changeManagerIdentity(): IdentityContext {
  return {
    userId: "user-cm",
    displayName: "Change Manager",
    groups: ["bcm:role:change_manager", "bcm:role:internal_admin", "bcm:role:asset_service", "bcm:role:factset"],
    tenant: "tenant-a",
    businessUnit: "investments",
    sessionId: "s",
  };
}

const benchmarkSwitch: ChangeTypeConfig = {
  id: "a0000000-0000-0000-0000-000000000001",
  slug: "benchmark_switch",
  name: "Benchmarkwissel",
  description: "Wijzig de benchmark van een portefeuille naar een andere benchmark",
  extendedExplanation: "Een benchmarkwissel wijzigt de referentie-index.",
  category: "benchmark",
  fields: [
    { key: "portfolio_id", label: "Portefeuille", type: "select", required: true, referenceTable: "portfolios" },
    { key: "current_benchmark_id", label: "Huidige benchmark (IST)", type: "benchmark", required: true, referenceTable: "benchmark_catalog", readOnly: true },
    { key: "requested_benchmark_id", label: "Gewenste benchmark (SOLL)", type: "benchmark", required: true, referenceTable: "benchmark_catalog" },
  ],
  istSollMapping: [
    { ist: "current_benchmark_id", soll: "requested_benchmark_id", labelIst: "Huidige benchmark (IST)", labelSoll: "Gewenste benchmark (SOLL)" },
  ],
  cost: { baseCost: 0, costCurrency: "EUR", perItemCost: 500, description: "€500 per portefeuille" },
  defaultLeadDays: 7,
  stakeholders: [
    { id: "internal_admin", name: "Interne administratie", role: "admin", notifyOn: ["on_submit", "on_approval"], mandatory: true, contactType: "webhook" },
    { id: "asset_service", name: "Asset service provider", role: "executor", notifyOn: ["on_approval"], mandatory: true, contactType: "email" },
    { id: "factset", name: "FactSet", role: "data_provider", notifyOn: ["on_completion"], mandatory: false, contactType: "webhook" },
  ],
  workflow: "benchmark_switch",
  processFlow: [
    { stepOrder: 1, stakeholder: "Interne administratie", stakeholderId: "internal_admin", action: "Aanvraag indienen", leadTime: "1 werkdag", description: "Interne administratie stelt de benchmarkwissel op." },
    { stepOrder: 2, stakeholder: "Asset service provider", stakeholderId: "asset_service", action: "Controleren en accorderen", leadTime: "3 werkdagen", description: "Asset service provider controleert." },
    { stepOrder: 3, stakeholder: "Asset service provider", stakeholderId: "asset_service", action: "Uitvoeren benchmarkwissel", leadTime: "2 werkdagen", description: "Asset service provider voert de wissel door." },
    { stepOrder: 4, stakeholder: "FactSet", stakeholderId: "factset", action: "Verwerken en bevestigen", leadTime: "1 werkdag", description: "FactSet verwerkt de wijziging." },
    { stepOrder: 5, stakeholder: "Interne administratie", stakeholderId: "internal_admin", action: "Gereedmelding", leadTime: "—", description: "Interne administratie meldt gereed." },
  ],
  active: true,
  sortOrder: 10,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const genericChange: ChangeTypeConfig = {
  id: "a0000000-0000-0000-0000-000000000003",
  slug: "fee_change",
  name: "Tariefwijziging",
  description: "Wijzig de beheervergoeding voor een portefeuille",
  category: "fee",
  fields: [
    { key: "portfolio_id", label: "Portefeuille", type: "select", required: true, referenceTable: "portfolios" },
    { key: "current_fee", label: "Huidig tarief (IST)", type: "currency", required: true },
    { key: "requested_fee", label: "Nieuw tarief (SOLL)", type: "currency", required: true },
    { key: "fee_type", label: "Type tarief", type: "select", required: true, options: [
      { value: "management_fee", label: "Beheervergoeding" },
      { value: "performance_fee", label: "Prestatievergoeding" },
      { value: "fixed_fee", label: "Vast tarief" },
    ] },
    { key: "effective_date", label: "Ingangsdatum", type: "date", required: true },
    { key: "rationale", label: "Reden wijziging", type: "longtext", required: true },
  ],
  istSollMapping: [
    { ist: "current_fee", soll: "requested_fee", labelIst: "Huidig tarief (IST)", labelSoll: "Nieuw tarief (SOLL)" },
  ],
  cost: { baseCost: 250, costCurrency: "EUR", description: "€250 vaste kost" },
  defaultLeadDays: 10,
  stakeholders: [
    { id: "internal_admin", name: "Interne administratie", role: "admin", notifyOn: ["on_submit", "on_approval"], mandatory: true, contactType: "webhook" },
    { id: "asset_service", name: "Asset service provider", role: "executor", notifyOn: ["on_approval"], mandatory: true, contactType: "email" },
    { id: "factset", name: "FactSet", role: "data_provider", notifyOn: ["on_completion"], mandatory: false, contactType: "webhook" },
  ],
  workflow: "fee_change",
  processFlow: [
    { stepOrder: 1, stakeholder: "Interne administratie", stakeholderId: "internal_admin", action: "Aanvraag indienen", leadTime: "1 werkdag", description: "Interne administratie stelt de tariefwijziging op." },
    { stepOrder: 2, stakeholder: "Asset service provider", stakeholderId: "asset_service", action: "Controleren en accorderen", leadTime: "3 werkdagen", description: "Asset service provider beoordeelt." },
    { stepOrder: 3, stakeholder: "FactSet", stakeholderId: "factset", action: "Verwerken in systeem", leadTime: "3 werkdagen", description: "FactSet verwerkt het nieuwe tarief." },
    { stepOrder: 4, stakeholder: "Interne administratie", stakeholderId: "internal_admin", action: "Gereedmelding", leadTime: "—", description: "Interne administratie meldt gereed." },
  ],
  active: true,
  sortOrder: 30,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function compileConfig(config: ChangeTypeConfig): CompatibilityCompileResult {
  return compileLegacyChangeType({
    identity: changeManagerIdentity(),
    config,
    scope: { tenant: "tenant-a", businessUnit: "investments" },
  });
}

describe("compileLegacyChangeType — benchmark switch", () => {
  const result = compileConfig(benchmarkSwitch);

  it("emits a form block with the original form fields and the emitted variables", () => {
    const form = result.draft.nodes.find((node) => node.block.blockType === "form");
    expect(form).toBeDefined();
    const configuration = form!.configuration as { fields: Array<{ id: string; label: string; type: string; required: boolean }> };
    const fieldKeys = configuration.fields.map((f) => f.id);
    // SOLL field is in the form, IST is via lookup; effective_date and rationale are injected.
    expect(fieldKeys).toContain("requested_benchmark_id");
    expect(fieldKeys).toContain("portfolio_id");
    expect(fieldKeys).toContain("effective_date");
    expect(fieldKeys).toContain("rationale");
    // current_benchmark_id is consumed by the lookup, not the form
    expect(fieldKeys).not.toContain("current_benchmark_id");
    // Same label, type, required as the legacy config
    const portfolio = configuration.fields.find((f) => f.id === "portfolio_id");
    expect(portfolio).toMatchObject({ label: "Portefeuille", type: "select", required: true });
  });

  it("emits a client_config_lookup for the IST field", () => {
    const lookup = result.draft.nodes.find((node) => node.block.blockType === "client_config_lookup");
    expect(lookup).toBeDefined();
    const configuration = lookup!.configuration as { resourceId: string; outputVariable: string; selection: string };
    expect(configuration.resourceId).toBe("benchmark");
    expect(configuration.outputVariable).toMatch(/^ist_current_benchmark_id/);
    expect(configuration.selection).toBe("one");
  });

  it("emits one role binding per mandatory stakeholder and skips optional ones", () => {
    expect(result.draft.roleBindings).toHaveLength(2);
    const roles = result.draft.roleBindings.map((binding) => binding.workflowRole);
    expect(roles).toContain("internal_admin");
    expect(roles).toContain("asset_service");
    const factset = result.draft.roleBindings.find((b) => b.workflowRole === "factset");
    expect(factset).toBeUndefined();
    const skipped = result.report.stakeholdersSkipped;
    expect(skipped.some((s) => s.id === "factset")).toBe(true);
  });

  it("maps the asset_service stakeholder to an approval block with the workflow:approve permission", () => {
    const approval = result.draft.nodes.find((node) => node.block.blockType === "approval");
    expect(approval).toBeDefined();
    const configuration = approval!.configuration as { roleId: string; title: string; requireCommentOnReject: boolean };
    expect(configuration.roleId).toBe("asset_service");
    expect(configuration.title).toContain("Asset service provider");
    expect(configuration.requireCommentOnReject).toBe(true);
    const binding = result.draft.roleBindings.find((b) => b.workflowRole === "asset_service");
    expect(binding?.permissions).toEqual(["workflow:approve"]);
    // approval uses the account_manager delegable role
    expect(binding?.identityGroup).toBe("bcm:role:account_manager");
  });

  it("maps the internal_admin stakeholder (on_submit) to a role_task with workflow:tasks:execute", () => {
    const task = result.draft.nodes.find((node) => node.block.blockType === "role_task");
    expect(task).toBeDefined();
    const binding = result.draft.roleBindings.find((b) => b.workflowRole === "internal_admin");
    expect(binding?.permissions).toEqual(["workflow:tasks:execute"]);
    // task uses the change_manager delegable role
    expect(binding?.identityGroup).toBe("bcm:role:change_manager");
  });

  it("emits a change_request for portfolio_configuration (UPDATE)", () => {
    const cr = result.draft.nodes.find((node) => node.block.blockType === "change_request");
    expect(cr).toBeDefined();
    const configuration = cr!.configuration as { resourceId: string; operation: string; effectiveDateVariable: string; rationaleVariable: string };
    expect(configuration.resourceId).toBe("portfolio_configuration");
    expect(configuration.operation).toBe("UPDATE");
    expect(configuration.effectiveDateVariable).toBe("effective_date");
    expect(configuration.rationaleVariable).toBe("rationale");
    expect(result.report.changeRequest).toMatchObject({ resourceId: "portfolio_configuration", operation: "UPDATE" });
  });

  it("places the cost, lead time and apply strategy into the description", () => {
    expect(result.draft.description).toMatch(/€500 per portefeuille/);
    expect(result.draft.description).toMatch(/Doorlooptijd: 7 dagen/);
    expect(result.draft.description).toMatch(/applyStrategy=ist_sync/);
  });

  it("produces a draft that passes the static workflow validator", () => {
    const validation = validator.validate({
      identity: changeManagerIdentity(),
      nodes: result.draft.nodes,
      edges: result.draft.edges,
      roleBindings: result.draft.roleBindings,
    });
    const errors = validation.issues.filter((issue) => issue.severity === "error");
    if (errors.length > 0) {
      console.log(JSON.stringify(validation.issues, null, 2));
    }
    expect(errors).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it("connects the graph in processFlow order: form → approvals → change_request → end", () => {
    const idByKey = new Map<string, string>();
    for (const node of result.draft.nodes) idByKey.set(node.nodeKey, node.id ?? node.nodeKey);
    const edges = result.draft.edges;
    const hasFormToApproval = edges.some((edge) => edge.sourceNodeId === idByKey.get("form_request") && edge.targetNodeId.startsWith(idByKey.get("approval_asset_service")!.slice(0, 8)));
    expect(hasFormToApproval).toBe(true);
    const changeToEnd = edges.find((edge) => edge.targetNodeId === idByKey.get("end"));
    expect(changeToEnd).toBeDefined();
    expect(changeToEnd!.sourceNodeId).toBe(idByKey.get("apply_change"));
  });

  it("uses a stable scope and slug matching the legacy config", () => {
    expect(result.draft.slug).toBe("benchmark_switch");
    expect(result.draft.scope).toEqual({ tenant: "tenant-a", businessUnit: "investments" });
  });
});

describe("compileLegacyChangeType — generic (fee change)", () => {
  const result = compileConfig(genericChange);

  it("preserves the SOLL field types and required flags", () => {
    const form = result.draft.nodes.find((node) => node.block.blockType === "form");
    const configuration = form!.configuration as { fields: Array<{ id: string; type: string; required: boolean; options?: ReadonlyArray<{ value: string; label: string }> }> };
    const feeType = configuration.fields.find((f) => f.id === "fee_type");
    expect(feeType).toMatchObject({ type: "select", required: true });
    expect(feeType?.options?.find((o) => o.value === "management_fee")).toBeDefined();
    const rationale = configuration.fields.find((f) => f.id === "rationale");
    expect(rationale).toMatchObject({ type: "longtext", required: true });
  });

  it("emits a lookup for the IST fee field", () => {
    const lookup = result.draft.nodes.find((node) => node.block.blockType === "client_config_lookup");
    expect(lookup).toBeDefined();
    const configuration = lookup!.configuration as { resourceId: string; outputVariable: string };
    expect(configuration.outputVariable).toMatch(/^ist_current_fee/);
  });

  it("emits role bindings for both mandatory stakeholders and skips FactSet", () => {
    const roles = result.draft.roleBindings.map((b) => b.workflowRole).sort();
    expect(roles).toEqual(["asset_service", "internal_admin"]);
  });

  it("warns and emits no change_request for ist_sync without a portfolio/benchmark mapping", () => {
    expect(result.report.applyStrategy).toBe("ist_sync");
    expect(result.report.changeRequest).toBeNull();
    expect(result.report.changeRequestWarning).toMatch(/Geen mutation-adapter/);
  });

  it("produces a draft that passes the static workflow validator", () => {
    const validation = validator.validate({
      identity: changeManagerIdentity(),
      nodes: result.draft.nodes,
      edges: result.draft.edges,
      roleBindings: result.draft.roleBindings,
    });
    const errors = validation.issues.filter((issue) => issue.severity === "error");
    if (errors.length > 0) {
      console.log(JSON.stringify(validation.issues, null, 2));
    }
    expect(errors).toEqual([]);
  });
});

describe("compileLegacyChangeType — edge cases", () => {
  it("returns no change_request and a warning when no mapping exists", () => {
    const noIst: ChangeTypeConfig = {
      ...genericChange,
      id: "00000000-0000-0000-0000-000000000099",
      slug: "standalone",
      istSollMapping: undefined,
      workflow: "standalone",
    };
    const result = compileConfig(noIst);
    expect(result.report.changeRequest).toBeNull();
    expect(result.report.changeRequestWarning).toMatch(/applyStrategy/);
  });

  it("handles an empty stakeholder list by emitting no human nodes", () => {
    const result = compileConfig({ ...genericChange, id: "x", slug: "x_no_stake", stakeholders: [], workflow: "x" });
    const humanNodes = result.draft.nodes.filter((node) => ["approval", "role_task", "notification"].includes(node.block.blockType));
    expect(humanNodes).toEqual([]);
    expect(result.draft.roleBindings).toEqual([]);
  });

  it("supports the createCompatibilityCompiler factory", () => {
    const compiler = createCompatibilityCompiler();
    const result = compiler.compile({ identity: changeManagerIdentity(), config: benchmarkSwitch, scope: { tenant: "t", businessUnit: "b" } });
    expect(result.draft.slug).toBe("benchmark_switch");
  });

  it("preserves client scope when supplied", () => {
    const result = compileLegacyChangeType({
      identity: changeManagerIdentity(),
      config: benchmarkSwitch,
      scope: { tenant: "tenant-a", businessUnit: "investments", clientIds: ["client-x", "client-y"] },
    });
    expect(result.draft.scope).toEqual({ tenant: "tenant-a", businessUnit: "investments", clientIds: ["client-x", "client-y"] });
    for (const binding of result.draft.roleBindings) {
      expect(binding.clientIds).toEqual(["client-x", "client-y"]);
    }
  });
});
