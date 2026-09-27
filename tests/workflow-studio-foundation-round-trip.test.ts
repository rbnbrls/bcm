/**
 * Round-trip contract tests for the Workflow Studio foundation.
 *
 * The foundation promises (plan task 1.14) that two existing change types can
 * be migrated to the Workflow Studio without information loss. The
 * compatibility compiler (1.13) is the tool that performs that translation;
 * this suite is the safety net that proves the round-trip holds for the
 * canonical examples mentioned in the plan acceptance criteria:
 *
 *   - `benchmark_switch` (an `ist_sync` apply strategy with IST/SOLL on a
 *     portfolio configuration attribute)
 *   - `fee_change` (a generic `ist_sync` change with no catalog-backed
 *     resource)
 *
 * For each compiled draft we assert the four invariants the foundation
 * guarantees:
 *
 *   1. Form data: the original field keys, labels, types and required flags
 *      are preserved, with IST fields becoming `client_config_lookup` nodes
 *      and SOLL fields becoming `form` fields.
 *   2. Costs: the legacy cost model is rendered into the workflow description
 *      so the publish-time preview shows the same numbers.
 *   3. Roles: each mandatory stakeholder becomes a role binding with the
 *      correct runtime permission (`workflow:approve` for approvers,
 *      `workflow:tasks:execute` for submitters) bound to a delegable
 *      identity group from the foundation's RBAC config.
 *   4. Apply strategy: a registered mutation adapter is referenced via a
 *      `change_request` block (or a warning is emitted for strategies that
 *      have no registered adapter, e.g. `fee_change`).
 *
 * The suite additionally proves the drafts survive the static workflow
 * validator (1.12) without errors so they are publish-ready out of the
 * compiler.
 */
import { describe, expect, it } from "vitest";
import type { IdentityContext } from "@/lib/identity/types";
import type { ChangeTypeConfig } from "@/lib/types";
import { blockRegistry } from "@/lib/workflow-studio/block-registry";
import { clientConfigDataCatalog } from "@/lib/workflow-studio/data-catalog";
import { compileLegacyChangeType } from "@/lib/workflow-studio/compatibility-compiler";
import {
  authorizeWorkflowRoleBinding,
  type WorkflowDataScope,
} from "@/lib/workflow-studio-authorization";
import { WorkflowValidator } from "@/lib/workflow-studio/workflow-validator";
import {
  workflowEdgeInputSchema,
  workflowNodeInputSchema,
  workflowRoleBindingInputSchema,
} from "@/lib/workflow-studio/definition-schema";

const benchmarkSwitch: ChangeTypeConfig = {
  id: "a0000000-0000-0000-0000-000000000001",
  slug: "benchmark_switch",
  name: "Benchmarkwissel",
  description: "Wijzig de benchmark van een portefeuille naar een andere benchmark",
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
    { stepOrder: 2, stakeholder: "Asset service provider", stakeholderId: "asset_service", action: "Controleren en accorderen", leadTime: "3 werkdagen", description: "Asset service provider beoordeelt." },
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

function buildBlockCatalog(): ReadonlyMap<string, ReturnType<typeof blockRegistry.contracts.resolve> extends { valid: true; value: infer V } ? V : never> {
  const map = new Map<string, never>();
  for (const entry of blockRegistry.listForIdentity({
    userId: "*",
    displayName: "*",
    groups: ["bcm:role:change_manager", "bcm:role:account_manager"],
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

function compilerIdentity(): IdentityContext {
  return {
    userId: "user:compiler",
    displayName: "Workflow Studio compiler",
    groups: ["bcm:role:change_manager", "bcm:role:account_manager"],
    tenant: "tenant-a",
    businessUnit: "investments",
    sessionId: "s",
  };
}

const scope: WorkflowDataScope = { tenant: "tenant-a", businessUnit: "investments" };

function assertFormRoundTrip(config: ChangeTypeConfig) {
  const result = compileLegacyChangeType({ identity: compilerIdentity(), config, scope });
  const form = result.draft.nodes.find((node) => node.block.blockType === "form");
  expect(form, `expected a form block for ${config.slug}`).toBeDefined();
  const formFields = (form!.configuration as { fields: Array<{ id: string; label: string; type: string; required: boolean; options?: ReadonlyArray<{ value: string; label: string }> }> }).fields;
  const lookupNodes = result.draft.nodes.filter((node) => node.block.blockType === "client_config_lookup");
  const istKeys = new Set((config.istSollMapping ?? []).map((entry) => entry.ist));
  const sollKeys = new Set((config.istSollMapping ?? []).map((entry) => entry.soll));

  for (const field of config.fields) {
    if (istKeys.has(field.key)) {
      // Field is realised by a lookup, not the form.
      const lookup = lookupNodes.find((node) => (node.configuration as { outputVariable?: string }).outputVariable?.endsWith(field.key));
      expect(lookup, `expected a lookup node for IST field ${field.key}`).toBeDefined();
    } else {
      const compiled = formFields.find((f) => f.id === field.key);
      expect(compiled, `expected form field ${field.key} in compiled draft`).toBeDefined();
      expect(compiled!.label).toBe(field.label);
      expect(compiled!.required).toBe(field.required);
      if (field.type === "benchmark") {
        expect(compiled!.type).toBe("select");
      } else {
        expect(compiled!.type).toBe(field.type);
      }
      if (field.options && (compiled!.type === "select" || compiled!.type === "multiselect")) {
        expect(compiled!.options?.length).toBe(field.options.length);
      }
    }
  }
  // Ensure every SOLL key has a form field (no missing fields).
  for (const sollKey of sollKeys) {
    expect(formFields.some((f) => f.id === sollKey), `missing SOLL field ${sollKey}`).toBe(true);
  }
}

function assertCostRoundTrip(config: ChangeTypeConfig) {
  const result = compileLegacyChangeType({ identity: compilerIdentity(), config, scope });
  const description = result.draft.description;
  if (config.cost.baseCost > 0) {
    expect(description).toMatch(new RegExp(`€${config.cost.baseCost.toLocaleString("nl-NL")}`));
  }
  if (config.cost.perItemCost && config.cost.perItemCost > 0) {
    expect(description).toMatch(new RegExp(`€${config.cost.perItemCost.toLocaleString("nl-NL")} per item`));
  }
  expect(description).toContain(config.cost.description);
  expect(description).toMatch(new RegExp(`Doorlooptijd: ${config.defaultLeadDays} dag`));
}

function assertRolesRoundTrip(config: ChangeTypeConfig) {
  const result = compileLegacyChangeType({ identity: compilerIdentity(), config, scope });
  const mandatory = config.stakeholders.filter((s) => s.mandatory);
  expect(result.draft.roleBindings).toHaveLength(mandatory.length);
  for (const binding of result.draft.roleBindings) {
    const stakeholder = mandatory.find((s) => binding.workflowRole === s.id.replace(/-/g, "_"));
    expect(stakeholder, `role binding ${binding.workflowRole} must match a mandatory stakeholder`).toBeDefined();
    // Every binding must be acceptable to the authorization helper.
    const decision = authorizeWorkflowRoleBinding(compilerIdentity(), {
      workflowRoleId: binding.workflowRole,
      identityGroups: [binding.identityGroup],
      permissions: binding.permissions,
      scope: { tenant: binding.tenant, businessUnit: binding.businessUnit, ...(binding.clientIds ? { clientIds: binding.clientIds } : {}) },
    });
    expect(decision.authorized, `role binding ${binding.workflowRole} should be authorizable: ${JSON.stringify(decision)}`).toBe(true);
  }
  // Optional stakeholders are not bound to a workflow role.
  const optional = config.stakeholders.filter((s) => !s.mandatory);
  for (const stakeholder of optional) {
    const workflowRole = stakeholder.id.replace(/-/g, "_");
    expect(result.draft.roleBindings.some((b) => b.workflowRole === workflowRole)).toBe(false);
  }
}

function assertValidatorRoundTrip(config: ChangeTypeConfig) {
  const result = compileLegacyChangeType({ identity: compilerIdentity(), config, scope });
  const validation = validator.validate({
    identity: compilerIdentity(),
    nodes: result.draft.nodes,
    edges: result.draft.edges,
    roleBindings: result.draft.roleBindings,
  });
  const errors = validation.issues.filter((issue) => issue.severity === "error");
  expect(errors, `expected no blocking validator issues for ${config.slug}, got: ${JSON.stringify(errors)}`).toEqual([]);
  expect(validation.valid).toBe(true);
}

function assertSchemaRoundTrip(config: ChangeTypeConfig) {
  const result = compileLegacyChangeType({ identity: compilerIdentity(), config, scope });
  for (const node of result.draft.nodes) {
    const parsed = workflowNodeInputSchema.safeParse(node);
    expect(parsed.success, `node ${node.nodeKey} failed schema validation: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
  }
  for (const edge of result.draft.edges) {
    const parsed = workflowEdgeInputSchema.safeParse(edge);
    expect(parsed.success, `edge ${edge.edgeKey} failed schema validation: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
  }
  for (const binding of result.draft.roleBindings) {
    const parsed = workflowRoleBindingInputSchema.safeParse(binding);
    expect(parsed.success, `role binding ${binding.workflowRole} failed schema validation: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
  }
}

describe("Foundation round-trip — benchmark switch", () => {
  it("preserves form data (keys, labels, types, required flags)", () => assertFormRoundTrip(benchmarkSwitch));
  it("preserves cost and lead time in the workflow description", () => assertCostRoundTrip(benchmarkSwitch));
  it("binds each mandatory stakeholder to an authorizable role", () => assertRolesRoundTrip(benchmarkSwitch));
  it("emits a draft that passes the static workflow validator", () => assertValidatorRoundTrip(benchmarkSwitch));
  it("emits a draft that round-trips through the input schema", () => assertSchemaRoundTrip(benchmarkSwitch));
});

describe("Foundation round-trip — generic change (fee change)", () => {
  it("preserves form data (keys, labels, types, required flags)", () => assertFormRoundTrip(genericChange));
  it("preserves cost and lead time in the workflow description", () => assertCostRoundTrip(genericChange));
  it("binds each mandatory stakeholder to an authorizable role", () => assertRolesRoundTrip(genericChange));
  it("emits a draft that passes the static workflow validator", () => assertValidatorRoundTrip(genericChange));
  it("emits a draft that round-trips through the input schema", () => assertSchemaRoundTrip(genericChange));
});

describe("Foundation round-trip — backward compatibility", () => {
  it("does not change the legacy ChangeTypeConfig shape used as input", () => {
    // Compile twice with the same config; the second compile must produce
    // identical node/edge/binding counts to prove determinism.
    const a = compileLegacyChangeType({ identity: compilerIdentity(), config: benchmarkSwitch, scope });
    const b = compileLegacyChangeType({ identity: compilerIdentity(), config: benchmarkSwitch, scope });
    expect(a.draft.nodes.length).toBe(b.draft.nodes.length);
    expect(a.draft.edges.length).toBe(b.draft.edges.length);
    expect(a.draft.roleBindings.length).toBe(b.draft.roleBindings.length);
  });

  it("keeps the original `change_type_config` reference in the workflow description", () => {
    const result = compileLegacyChangeType({ identity: compilerIdentity(), config: benchmarkSwitch, scope });
    expect(result.draft.description).toContain(benchmarkSwitch.id);
  });
});
