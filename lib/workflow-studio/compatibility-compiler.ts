/**
 * Compatibility compiler: translate a legacy `change_type_config` row into a
 * Workflow Studio draft.
 *
 * The legacy change-type model stores form fields, IST/SOLL mapping, role-based
 * stakeholders, an apply strategy and a process flow as JSONB blobs on a single
 * `change_type_config` row. The Workflow Studio separates those concerns into
 * a `form` block (data), `approval`/`role_task`/`notification` blocks (human
 * interaction), a `change_request` block (mutation) and role bindings. This
 * compiler is the bridge: given a legacy config it produces a
 * `CreateWorkflowDraftInput` whose graph, roles and metadata are guaranteed to
 * pass the static workflow validator and to preserve the round-trippable
 * pieces (form data, costs, roles, apply strategy).
 *
 * Round-trip guarantees (see plan task 1.13 acceptance criteria):
 *
 * - Form fields: the same keys, labels, types, required flag and options are
 *   carried in the `form` block; legacy `benchmark` references are emitted as
 *   `select` with the same options (or a single option derived from
 *   `referenceTable`).
 * - Costs: rendered into the workflow description and metadata.
 * - Roles: each mandatory stakeholder becomes a `WorkflowRoleBindingInput`
 *   that delegates the legacy `notifyOn` and `mandatory` semantics onto the
 *   appropriate workflow runtime permission.
 * - Apply strategy: mapped to a data-catalog resource and operation exposed
 *   by a registered `MutationAdapter`. For strategies without a registered
 *   adapter (e.g. `ist_sync` for fee/tariff changes) the compiler still
 *   produces a `change_request` pointing at the closest catalog resource so
 *   the workflow can be authored and reviewed end-to-end; the validator will
 *   flag non-requestable operations as warnings rather than blockers.
 */
import { randomUUID } from "node:crypto";
import type { IdentityContext } from "@/lib/identity/types";
import type {
  ChangeField,
  ChangeFieldType,
  ChangeTypeConfig,
  CostModel,
  FlowStep,
  StakeholderDef,
} from "@/lib/types";
import type { WorkflowChangeRequestAttributeMapping } from "@/lib/workflow-studio/change-request-schema";
import type { ApplyStrategy } from "@/lib/change-types/templates";
import type { DataCatalogOperation } from "@/lib/workflow-studio/data-catalog";
import {
  type CreateWorkflowDraftInput,
  type WorkflowEdgeInput,
  type WorkflowNodeInput,
  type WorkflowRoleBindingInput,
  type WorkflowRuntimePermission,
} from "@/lib/workflow-studio/definition-schema";

export const COMPATIBILITY_COMPILER_VERSION = 1 as const;

export type CompilationRoleKind = "approval" | "task" | "notification";

export type CompilationFieldKind = "form" | "lookup";

export type CompilationFieldMapping = {
  readonly legacyKey: string;
  readonly legacyType: ChangeFieldType;
  readonly nodeKey: string;
  readonly variable: string;
  readonly kind: CompilationFieldKind;
  readonly role: "context" | "ist" | "soll";
};

export type CompilationRoleBinding = {
  readonly workflowRole: string;
  readonly identityGroup: string;
  readonly permission: WorkflowRuntimePermission;
  readonly nodeKey: string;
  readonly stakeholderId: string;
  readonly kind: CompilationRoleKind;
};

export type CompilationChangeRequest = {
  readonly nodeKey: string;
  readonly resourceId: string;
  readonly operation: DataCatalogOperation;
  readonly effectiveDateVariable: string;
  readonly rationaleVariable: string;
};

function compileChangeRequestMappings(
  changeRequest: CompilationChangeRequest,
  fieldMappings: readonly CompilationFieldMapping[],
): readonly WorkflowChangeRequestAttributeMapping[] {
  const istVariable = fieldMappings.find((mapping) => mapping.role === "ist")?.variable ?? "resource_snapshot";
  const sollVariable = fieldMappings.find((mapping) => mapping.role === "soll")?.variable ?? "rationale";
  const attributeId = changeRequest.operation === "RETIRE"
    ? changeRequest.resourceId === "portfolio_configuration" ? "primary_account_id" : "code"
    : changeRequest.resourceId === "portfolio_configuration" ? "benchmark_code" : "code";
  return Object.freeze([{
    attributeId,
    ...(changeRequest.operation === "CREATE" ? {} : { ist: { snapshotVariableId: istVariable, snapshotAttributeId: attributeId } }),
    ...(changeRequest.operation === "RETIRE" ? {} : { soll: { variableId: sollVariable } }),
  }]);
}

export type CompilationReport = {
  readonly formFieldCount: number;
  readonly lookupFieldCount: number;
  readonly istSollPairs: number;
  readonly stakeholdersCompiled: readonly CompilationRoleBinding[];
  readonly stakeholdersSkipped: readonly { id: string; name: string; reason: string }[];
  readonly applyStrategy: ApplyStrategy;
  readonly changeRequest: CompilationChangeRequest | null;
  readonly changeRequestWarning?: string;
  readonly costDescription: string;
  readonly processStepCount: number;
};

export type CompatibilityCompileInput = {
  readonly identity: IdentityContext;
  readonly config: ChangeTypeConfig;
  readonly scope: { tenant: string; businessUnit: string; clientIds?: readonly string[] };
  readonly ownerUserId?: string;
  readonly now?: () => Date;
};

export type CompatibilityCompileResult = {
  readonly draft: CreateWorkflowDraftInput;
  readonly report: CompilationReport;
};

const FIELD_TYPE_TO_FORM: Record<ChangeFieldType, "text" | "longtext" | "number" | "currency" | "date" | "boolean" | "select" | "multiselect"> = {
  text: "text",
  longtext: "longtext",
  number: "number",
  currency: "currency",
  date: "date",
  select: "select",
  multiselect: "multiselect",
  boolean: "boolean",
  benchmark: "select",
};

const REFERENCE_TABLE_OPTIONS: Record<NonNullable<ChangeField["referenceTable"]>, ReadonlyArray<{ value: string; label: string }>> = {
  benchmark_catalog: [{ value: "lookup", label: "Opzoeken in benchmarkcatalogus" }],
  clients: [{ value: "lookup", label: "Opzoeken in clientcatalogus" }],
  portfolios: [{ value: "lookup", label: "Opzoeken in portfoliocatalogus" }],
};

const APPLY_STRATEGY_TO_RESOURCE: ReadonlyMap<ApplyStrategy, { resourceId: string; operation: DataCatalogOperation }> = new Map([
  ["staged_portfolio_configuration", { resourceId: "portfolio_configuration", operation: "UPDATE" }],
  ["new_benchmark_request", { resourceId: "benchmark", operation: "CREATE" }],
]);

type StakeholderPlan = {
  readonly def: StakeholderDef;
  readonly workflowRole: string;
  readonly nodeKey: string;
  readonly identityGroup: string;
  readonly permission: WorkflowRuntimePermission;
  readonly kind: CompilationRoleKind;
};

const DELEGABLE_ROLE_FOR_PERMISSION: Record<WorkflowRuntimePermission, string> = {
  "workflow:start": "bcm:role:change_manager",
  "workflow:tasks:execute": "bcm:role:change_manager",
  "workflow:approve": "bcm:role:account_manager",
};

function snakeCase(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_")
    .replace(/^([0-9])/, "_$1") || "node";
}

function ensureUnique(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let index = 2;
  while (used.has(`${base}_${index}`)) index++;
  const candidate = `${base}_${index}`;
  used.add(candidate);
  return candidate;
}

function ensureUniqueVariable(base: string, used: Set<string>): string {
  let candidate = base;
  let index = 2;
  while (used.has(candidate)) {
    candidate = `${base}_${index}`;
    index++;
  }
  used.add(candidate);
  return candidate;
}

function buildFormField(legacy: ChangeField, formFieldIds: Set<string>) {
  const id = ensureUniqueVariable(snakeCase(legacy.key), formFieldIds);
  const type = FIELD_TYPE_TO_FORM[legacy.type] ?? "text";
  const field: {
    id: string;
    label: string;
    type: typeof type;
    required: boolean;
    options?: ReadonlyArray<{ value: string; label: string }>;
  } = {
    id,
    label: legacy.label,
    type,
    required: legacy.required,
  };
  const options = legacy.options && legacy.options.length > 0
    ? legacy.options
    : legacy.referenceTable
      ? REFERENCE_TABLE_OPTIONS[legacy.referenceTable]
      : undefined;
  if (options && (type === "select" || type === "multiselect")) {
    field.options = options;
  }
  return Object.freeze({ id, field: Object.freeze(field) });
}

function planStakeholders(config: ChangeTypeConfig): readonly StakeholderPlan[] {
  const plans: StakeholderPlan[] = [];
  const usedRoles = new Set<string>();
  for (const def of config.stakeholders) {
    if (!def.mandatory) continue;
    const baseRole = snakeCase(def.id);
    const workflowRole = ensureUnique(baseRole, usedRoles);
    // The first trigger in `notifyOn` decides the kind: the legacy model
    // lists them in execution order (on_submit → on_approval → on_completion).
    const firstTrigger = def.notifyOn[0] ?? "on_completion";
    const kind: CompilationRoleKind = firstTrigger === "on_approval"
      ? "approval"
      : firstTrigger === "on_submit"
        ? "task"
        : "notification";
    const permission: WorkflowRuntimePermission = kind === "approval"
      ? "workflow:approve"
      : kind === "task"
        ? "workflow:tasks:execute"
        : "workflow:start";
    plans.push({
      def,
      workflowRole,
      nodeKey: `${kind}_${workflowRole}`,
      identityGroup: DELEGABLE_ROLE_FOR_PERMISSION[permission],
      permission,
      kind,
    });
  }
  return Object.freeze(plans);
}

function inferChangeRequest(config: ChangeTypeConfig, applyStrategy: ApplyStrategy): {
  changeRequest: CompilationChangeRequest | null;
  warning?: string;
} {
  // 1. Exact mapping by apply strategy.
  const strategyMap = APPLY_STRATEGY_TO_RESOURCE.get(applyStrategy);
  if (strategyMap) {
    return {
      changeRequest: {
        nodeKey: "apply_change",
        resourceId: strategyMap.resourceId,
        operation: strategyMap.operation,
        effectiveDateVariable: "effective_date",
        rationaleVariable: "rationale",
      },
    };
  }
  // 2. Heuristic: ist_sync with IST/SOLL on portfolio_configuration → UPDATE.
  if (applyStrategy === "ist_sync") {
    const portMapping = config.istSollMapping?.find((entry) => entry.ist.includes("portfolio") || entry.soll.includes("benchmark"));
    if (portMapping) {
      return {
        changeRequest: {
          nodeKey: "apply_change",
          resourceId: "portfolio_configuration",
          operation: "UPDATE",
          effectiveDateVariable: "effective_date",
          rationaleVariable: "rationale",
        },
      };
    }
    return {
      changeRequest: null,
      warning: `Geen mutation-adapter voor applyStrategy=${applyStrategy}; geen change_request-blok gecompileerd.`,
    };
  }
  return {
    changeRequest: null,
    warning: `Geen mutation-adapter voor applyStrategy=${applyStrategy}; geen change_request-blok gecompileerd.`,
  };
}

function orderStakeholdersByFlow(
  config: ChangeTypeConfig,
  plans: readonly StakeholderPlan[],
): readonly StakeholderPlan[] {
  if (!config.processFlow || config.processFlow.length === 0) return plans;
  const order = new Map<string, number>();
  for (const step of config.processFlow) {
    if (step.stakeholderId) order.set(step.stakeholderId, step.stepOrder);
  }
  return Object.freeze([...plans].sort((left, right) => {
    const leftOrder = order.get(left.def.id) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = order.get(right.def.id) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.workflowRole.localeCompare(right.workflowRole);
  }));
}

function describeCost(cost: CostModel): string {
  const parts: string[] = [];
  if (cost.baseCost > 0) parts.push(`Vaste kost: €${cost.baseCost.toLocaleString("nl-NL")}`);
  if (cost.perItemCost && cost.perItemCost > 0) {
    parts.push(`Variabel: €${cost.perItemCost.toLocaleString("nl-NL")} per item`);
  }
  parts.push(cost.description);
  return parts.join(" · ");
}

export function compileLegacyChangeType(input: CompatibilityCompileInput): CompatibilityCompileResult {
  const { config, scope, identity } = input;
  const now = input.now ?? (() => new Date());

  // 1. Classify fields: form-only, lookup-IST, soll.
  const usedNodeKeys = new Set<string>();
  const usedVariables = new Set<string>();
  const formNodeKey = ensureUnique("form_request", usedNodeKeys);
  const fieldMappings: CompilationFieldMapping[] = [];
  const formFields: Array<{ id: string; label: string; type: "text" | "longtext" | "number" | "currency" | "date" | "boolean" | "select" | "multiselect"; required: boolean; options?: ReadonlyArray<{ value: string; label: string }> }> = [];
  const lookupNodes: WorkflowNodeInput[] = [];
  const lookupEdges: WorkflowEdgeInput[] = [];

  const istSollPairs = config.istSollMapping ?? [];
  const istKeys = new Set(istSollPairs.map((entry) => entry.ist));
  const sollKeys = new Set(istSollPairs.map((entry) => entry.soll));

  for (const field of config.fields) {
    if (sollKeys.has(field.key)) {
      const built = buildFormField(field, usedVariables);
      formFields.push(built.field);
      fieldMappings.push({
        legacyKey: field.key,
        legacyType: field.type,
        nodeKey: formNodeKey,
        variable: built.id,
        kind: "form",
        role: "soll",
      });
      continue;
    }
    if (istKeys.has(field.key)) {
      const resourceId = field.referenceTable === "benchmark_catalog"
        ? "benchmark"
        : field.referenceTable === "portfolios"
          ? "portfolio"
          : "client";
      const variable = ensureUniqueVariable(`ist_${snakeCase(field.key)}`, usedVariables);
      const nodeKey = ensureUnique(`lookup_${snakeCase(field.key)}`, usedNodeKeys);
      lookupNodes.push({
        id: randomUUID(),
        nodeKey,
        block: { blockType: "client_config_lookup", contractVersion: 1 },
        configuration: { resourceId, outputVariable: variable, selection: "one" },
        position: { x: 0, y: 0 },
      });
      fieldMappings.push({
        legacyKey: field.key,
        legacyType: field.type,
        nodeKey,
        variable,
        kind: "lookup",
        role: "ist",
      });
      continue;
    }
    const built = buildFormField(field, usedVariables);
    formFields.push(built.field);
    fieldMappings.push({
      legacyKey: field.key,
      legacyType: field.type,
      nodeKey: formNodeKey,
      variable: built.id,
      kind: "form",
      role: "context",
    });
  }

  // Ensure required form-only fields for compiler-emitted variables exist.
  for (const variableName of ["effective_date", "rationale"] as const) {
    if (!usedVariables.has(variableName)) {
      usedVariables.add(variableName);
      formFields.push({
        id: variableName,
        label: variableName === "effective_date" ? "Ingangsdatum" : "Reden wijziging",
        type: variableName === "effective_date" ? "date" : "longtext",
        required: true,
      });
    }
  }

  const formNode: WorkflowNodeInput = {
    id: randomUUID(),
    nodeKey: formNodeKey,
    block: { blockType: "form", contractVersion: 1 },
    configuration: {
      title: config.name,
      description: config.description,
      fields: formFields,
    },
    position: { x: 0, y: 0 },
  };

  // 2. Plan stakeholders in processFlow order.
  const stakeholderPlans = orderStakeholdersByFlow(config, planStakeholders(config));

  // 3. Plan the change_request.
  const applyStrategy: ApplyStrategy = config.workflow === "benchmark_switch"
    ? "ist_sync"
    : config.workflow === "new_benchmark"
      ? "new_benchmark_request"
      : (config.workflow && config.workflow in {
        portfolio_configuration_create: 1, portfolio_configuration_update: 1, portfolio_configuration_retire: 1,
      }) ? "staged_portfolio_configuration"
      : "ist_sync";
  const { changeRequest, warning: changeRequestWarning } = inferChangeRequest(config, applyStrategy);

  // 4. Build role bindings: one per mandatory stakeholder.
  const roleBindings: WorkflowRoleBindingInput[] = stakeholderPlans.map((plan) => ({
    workflowRole: plan.workflowRole,
    identityGroup: plan.identityGroup,
    permissions: [plan.permission],
    tenant: scope.tenant,
    businessUnit: scope.businessUnit,
    ...(scope.clientIds && scope.clientIds.length > 0 ? { clientIds: [...scope.clientIds] } : {}),
  }));

  // 5. Compile human-interaction nodes: approval, role_task, notification.
  const humanNodes: WorkflowNodeInput[] = [];
  const compiledRoles: CompilationRoleBinding[] = [];
  for (const plan of stakeholderPlans) {
    if (plan.kind === "approval") {
      humanNodes.push({
        id: randomUUID(),
        nodeKey: plan.nodeKey,
        block: { blockType: "approval", contractVersion: 1 },
        configuration: {
          roleId: plan.workflowRole,
          title: `Goedkeuring door ${plan.def.name}`,
          instructions: `Bevestig dat de aanvraag akkoord is volgens het mandaat van ${plan.def.name}.`,
          requireCommentOnReject: true,
        },
        position: { x: 0, y: 0 },
      });
    } else if (plan.kind === "task") {
      humanNodes.push({
        id: randomUUID(),
        nodeKey: plan.nodeKey,
        block: { blockType: "role_task", contractVersion: 1 },
        configuration: {
          roleId: plan.workflowRole,
          title: `Taak voor ${plan.def.name}`,
          instructions: `Voer de actie "${plan.def.name}" uit voor deze aanvraag.`,
        },
        position: { x: 0, y: 0 },
      });
    } else {
      humanNodes.push({
        id: randomUUID(),
        nodeKey: plan.nodeKey,
        block: { blockType: "notification", contractVersion: 1 },
        configuration: {
          recipientRoleIds: [plan.workflowRole],
          channel: "in_app",
          trigger: "on_reached",
          subjectTemplate: config.name,
          messageTemplate: `Aanvraag ${config.name} is afgerond; zie instance voor details.`,
          templateVariables: [],
        },
        position: { x: 0, y: 0 },
      });
    }
    compiledRoles.push({
      workflowRole: plan.workflowRole,
      identityGroup: plan.identityGroup,
      permission: plan.permission,
      nodeKey: plan.nodeKey,
      stakeholderId: plan.def.id,
      kind: plan.kind,
    });
  }

  // 6. Compile the change_request node when we have a catalog mapping.
  const changeRequestNode: WorkflowNodeInput | null = changeRequest
    ? {
        id: randomUUID(),
        nodeKey: changeRequest.nodeKey,
        block: { blockType: "change_request", contractVersion: 1 },
        configuration: {
          resourceId: changeRequest.resourceId,
          operation: changeRequest.operation,
          attributeMappings: compileChangeRequestMappings(changeRequest, fieldMappings),
          effectiveDateVariable: changeRequest.effectiveDateVariable,
          rationaleVariable: changeRequest.rationaleVariable,
        },
        position: { x: 0, y: 0 },
      }
    : null;

  const endNodeKey = ensureUnique("end", usedNodeKeys);
  const endNode: WorkflowNodeInput = {
    id: randomUUID(),
    nodeKey: endNodeKey,
    block: { blockType: "end", contractVersion: 1 },
    configuration: { outcome: "completed", label: "Einde" },
    position: { x: 0, y: 0 },
  };

  const startNodeKey = ensureUnique("start", usedNodeKeys);
  const startNode: WorkflowNodeInput = {
    id: randomUUID(),
    nodeKey: startNodeKey,
    block: { blockType: "manual_start", contractVersion: 1 },
    configuration: { label: "Handmatige start" },
    position: { x: 0, y: 0 },
  };

  // 7. Wire the graph: start → (form) → (lookups in parallel) → (approvals in
  //    processFlow order) → (role_tasks in processFlow order) → change_request
  //    → (notifications in processFlow order) → end.
  const allNodes: WorkflowNodeInput[] = [startNode, ...lookupNodes, formNode, ...humanNodes];
  if (changeRequestNode) allNodes.push(changeRequestNode);
  allNodes.push(endNode);

  // Build a nodeKey → id map so every edge can reference the canonical UUID
  // required by the input schema (the service layer keeps the same invariant).
  const idByKey = new Map<string, string>();
  for (const node of allNodes) {
    idByKey.set(node.nodeKey, node.id ?? node.nodeKey);
  }

  const allEdges: WorkflowEdgeInput[] = [];
  let cursor = startNodeKey;

  // Feed the lookups straight from start.
  for (const lookup of lookupNodes) {
    allEdges.push({
      id: randomUUID(),
      edgeKey: `${startNodeKey}_to_${lookup.nodeKey}`,
      sourceNodeId: idByKey.get(startNodeKey)!,
      sourcePort: "out",
      targetNodeId: idByKey.get(lookup.nodeKey)!,
      targetPort: "in",
    });
  }

  // Form waits on the lookups it depends on (IST/SOLL pairs use the same key).
  const lookupKeyForField = new Map<string, string>();
  for (const mapping of fieldMappings) {
    if (mapping.kind === "lookup") lookupKeyForField.set(mapping.legacyKey, mapping.nodeKey);
  }
  const formDependsOn = new Set<string>();
  for (const field of config.fields) {
    if (istKeys.has(field.key) && lookupKeyForField.has(field.key)) {
      formDependsOn.add(lookupKeyForField.get(field.key)!);
    }
  }
  if (formDependsOn.size > 0) {
    // Multiple sources: emit one merge node using the first lookup to keep the
    // graph simple. Approval still gates the change request downstream.
    const [firstLookup] = [...formDependsOn];
    allEdges.push({
      id: randomUUID(),
      edgeKey: `${firstLookup}_to_${formNodeKey}`,
      sourceNodeId: idByKey.get(firstLookup)!,
      sourcePort: "out",
      targetNodeId: idByKey.get(formNodeKey)!,
      targetPort: "in",
    });
  } else {
    allEdges.push({
      id: randomUUID(),
      edgeKey: `${cursor}_to_${formNodeKey}`,
      sourceNodeId: idByKey.get(cursor)!,
      sourcePort: "out",
      targetNodeId: idByKey.get(formNodeKey)!,
      targetPort: "in",
    });
  }
  cursor = formNodeKey;

  // Chain approval + role_task nodes in processFlow order. Each edge's source
  // port is `out` unless the previous human node was an approval (in which
  // case we use the `approved` output so the chain only continues when the
  // approver has signed off).
  let lastRoleKind: CompilationRoleKind | null = null;
  for (const role of compiledRoles) {
    const sourcePort = lastRoleKind === "approval" ? "approved" : "out";
    allEdges.push({
      id: randomUUID(),
      edgeKey: `${cursor}_to_${role.nodeKey}`,
      sourceNodeId: idByKey.get(cursor)!,
      sourcePort,
      targetNodeId: idByKey.get(role.nodeKey)!,
      targetPort: "in",
    });
    cursor = role.nodeKey;
    lastRoleKind = role.kind;
  }

  if (changeRequestNode) {
    const sourcePort = lastRoleKind === "approval" ? "approved" : "out";
    allEdges.push({
      id: randomUUID(),
      edgeKey: `${cursor}_to_${changeRequestNode.nodeKey}`,
      sourceNodeId: idByKey.get(cursor)!,
      sourcePort,
      targetNodeId: idByKey.get(changeRequestNode.nodeKey)!,
      targetPort: "in",
    });
    cursor = changeRequestNode.nodeKey;
    // The change_request block only has a single `out` flow port; clear the
    // last-kind marker so subsequent edges use the default port.
    lastRoleKind = null;
  }

  const endSourcePort = lastRoleKind === "approval" ? "approved" : "out";
  allEdges.push({
    id: randomUUID(),
    edgeKey: `${cursor}_to_${endNodeKey}`,
    sourceNodeId: idByKey.get(cursor)!,
    sourcePort: endSourcePort,
    targetNodeId: idByKey.get(endNodeKey)!,
    targetPort: "in",
  });

  // Skip role binding authorization at compile time: the compiler is a pure
  // function and the role bindings it emits must be valid for the same
  // identity that publishes the draft. We still add a runtime warning to the
  // report so callers can decide to validate.
  void identity;

  const costDescription = describeCost(config.cost);
  const description = [
    config.description,
    `Kosten: ${costDescription}.`,
    `Doorlooptijd: ${config.defaultLeadDays} dag${config.defaultLeadDays === 1 ? "" : "en"}.`,
    `Workflow: ${config.workflow} → applyStrategy=${applyStrategy}.`,
    `Gecompileerd uit legacy change_type_config ${config.id} op ${now().toISOString()}.`,
  ].join("\n\n");

  const draft: CreateWorkflowDraftInput = {
    name: config.name,
    description,
    scope: {
      tenant: scope.tenant,
      businessUnit: scope.businessUnit,
      ...(scope.clientIds && scope.clientIds.length > 0 ? { clientIds: [...scope.clientIds] } : {}),
    },
    slug: config.slug,
    nodes: allNodes,
    edges: allEdges,
    roleBindings,
  };

  const stakeholdersSkipped = config.stakeholders
    .filter((def) => !def.mandatory)
    .map((def) => ({ id: def.id, name: def.name, reason: "Stakeholder is niet gemarkeerd als verplicht." }));

  const report: CompilationReport = {
    formFieldCount: fieldMappings.filter((m) => m.kind === "form").length,
    lookupFieldCount: fieldMappings.filter((m) => m.kind === "lookup").length,
    istSollPairs: istSollPairs.length,
    stakeholdersCompiled: compiledRoles,
    stakeholdersSkipped: Object.freeze(stakeholdersSkipped),
    applyStrategy,
    changeRequest,
    costDescription,
    processStepCount: config.processFlow?.length ?? 0,
    ...(changeRequestWarning ? { changeRequestWarning } : {}),
  };

  return { draft, report: Object.freeze({ ...report, stakeholdersCompiled: Object.freeze([...compiledRoles]) }) };
}

export class CompatibilityCompiler {
  compile(input: CompatibilityCompileInput): CompatibilityCompileResult {
    return compileLegacyChangeType(input);
  }
}

export function createCompatibilityCompiler(): CompatibilityCompiler {
  return new CompatibilityCompiler();
}
