import type { IdentityContext } from "@/lib/identity/types";
import type { ChangeFieldValue, ChangeTypeConfig } from "@/lib/types";
import type { WorkflowNodeInput } from "@/lib/workflow-studio/definition-schema";
import type { WorkflowEditorNode } from "@/lib/workflow-studio/editor-model";
import { compileLegacyChangeType } from "@/lib/workflow-studio/compatibility-compiler";

export const WORKFLOW_RUNTIME_SHADOW_SLUGS = Object.freeze(["benchmark_switch", "fee_change"] as const);

export type WorkflowRuntimeShadowSlug = (typeof WORKFLOW_RUNTIME_SHADOW_SLUGS)[number];

export type WorkflowRuntimeShadowCheckStatus = "equivalent" | "explained_deviation" | "mismatch";
export type WorkflowRuntimeShadowStatus = WorkflowRuntimeShadowCheckStatus | "unsupported";

export type WorkflowRuntimeShadowClassicApplyPlan = Readonly<{
  resourceId: string;
  operation: "CREATE" | "UPDATE" | "RETIRE";
  attributes: readonly { attributeId: string; ist: unknown; soll: unknown }[];
}>;

export type WorkflowRuntimeShadowInput = Readonly<{
  identity: IdentityContext;
  config: ChangeTypeConfig;
  scope: { tenant: string; businessUnit: string; clientIds?: readonly string[] };
  formValues: Readonly<Record<string, unknown>>;
  fieldPairs: readonly ChangeFieldValue[];
  effectiveDate: string;
  rationale: string;
  classicApplyPlan?: WorkflowRuntimeShadowClassicApplyPlan;
}>;

export type WorkflowRuntimeShadowCheck = Readonly<{
  name: "form_data" | "decisions" | "staging" | "apply_plan";
  status: WorkflowRuntimeShadowCheckStatus;
  classic: unknown;
  runtime: unknown;
  explanation?: string;
  differences: readonly string[];
}>;

export type WorkflowRuntimeShadowReport = Readonly<{
  changeTypeSlug: string;
  status: WorkflowRuntimeShadowStatus;
  workflowName?: string;
  workflowNodeCount?: number;
  workflowEdgeCount?: number;
  checks: readonly WorkflowRuntimeShadowCheck[];
  issues: readonly string[];
}>;

function isShadowSlug(slug: string): slug is WorkflowRuntimeShadowSlug {
  return WORKFLOW_RUNTIME_SHADOW_SLUGS.includes(slug as WorkflowRuntimeShadowSlug);
}

function normalize(value: unknown): unknown {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, normalize(nested)]));
  }
  return value;
}

function equivalent(left: unknown, right: unknown): boolean {
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function check(
  name: WorkflowRuntimeShadowCheck["name"],
  classic: unknown,
  runtime: unknown,
  explanation?: string,
): WorkflowRuntimeShadowCheck {
  const same = equivalent(classic, runtime);
  return {
    name,
    status: same ? "equivalent" : explanation ? "explained_deviation" : "mismatch",
    classic,
    runtime,
    ...(explanation && !same ? { explanation } : {}),
    differences: same ? [] : [`${name} verschilt tussen classic en runtime shadow.`],
  };
}

function toEditorNode(node: WorkflowNodeInput): WorkflowEditorNode {
  return {
    id: node.id ?? node.nodeKey,
    nodeKey: node.nodeKey,
    blockType: node.block.blockType,
    contractVersion: node.block.contractVersion,
    label: node.nodeKey,
    description: "",
    configuration: node.configuration,
    position: node.position,
  };
}

function lookupFixtureFor(fieldPairs: readonly ChangeFieldValue[], legacyKey: string): Record<string, unknown> {
  const pair = fieldPairs.find((item) => item.fieldKey === legacyKey);
  const value = pair?.istValue ?? pair?.sollValue ?? null;
  return {
    code: value,
    benchmark_code: value,
    primary_account_id: value,
    value,
  };
}

function buildRuntimeVariables(
  nodes: readonly WorkflowEditorNode[],
  input: WorkflowRuntimeShadowInput,
): Record<string, unknown> {
  const variables: Record<string, unknown> = {
    ...input.formValues,
    effective_date: input.effectiveDate,
    rationale: input.rationale,
  };

  for (const node of nodes) {
    if (node.blockType !== "client_config_lookup") continue;
    const configuration = node.configuration && typeof node.configuration === "object"
      ? node.configuration as Record<string, unknown>
      : {};
    const outputVariable = typeof configuration.outputVariable === "string" ? configuration.outputVariable : "";
    const legacyKey = outputVariable.replace(/^ist_/, "");
    variables[outputVariable] = lookupFixtureFor(input.fieldPairs, legacyKey);
  }

  return variables;
}

function formFieldIds(nodes: readonly WorkflowEditorNode[]): readonly string[] {
  return nodes
    .filter((node) => node.blockType === "form")
    .flatMap((node) => {
      const configuration = node.configuration && typeof node.configuration === "object"
        ? node.configuration as Record<string, unknown>
        : {};
      return Array.isArray(configuration.fields)
        ? configuration.fields
            .map((field) => field && typeof field === "object" ? (field as Record<string, unknown>).id : undefined)
            .filter((field): field is string => typeof field === "string")
        : [];
    });
}

function approvalNodeKeys(nodes: readonly WorkflowEditorNode[]): readonly string[] {
  return nodes.filter((node) => node.blockType === "approval").map((node) => node.nodeKey).sort();
}

function classicApprovalStakeholders(config: ChangeTypeConfig): readonly string[] {
  return config.stakeholders
    .filter((stakeholder) => stakeholder.mandatory && stakeholder.notifyOn[0] === "on_approval")
    .map((stakeholder) => `approval_${stakeholder.id}`)
    .sort();
}

function snapshotAttribute(snapshot: unknown, attributeId: unknown): unknown {
  return typeof attributeId === "string" && snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? (snapshot as Record<string, unknown>)[attributeId]
    : undefined;
}

function plannedChangeRequest(nodes: readonly WorkflowEditorNode[], variables: Readonly<Record<string, unknown>>): WorkflowRuntimeShadowClassicApplyPlan | null {
  const node = nodes.find((item) => item.blockType === "change_request");
  if (!node || !node.configuration || typeof node.configuration !== "object") return null;
  const configuration = node.configuration as Record<string, unknown>;
  if (typeof configuration.resourceId !== "string" || typeof configuration.operation !== "string") return null;
  const mappings = Array.isArray(configuration.attributeMappings) ? configuration.attributeMappings : [];
  return {
    resourceId: configuration.resourceId,
    operation: configuration.operation as WorkflowRuntimeShadowClassicApplyPlan["operation"],
    attributes: mappings.map((mapping) => {
      const item = mapping && typeof mapping === "object" ? mapping as Record<string, unknown> : {};
      const ist = item.ist && typeof item.ist === "object" ? item.ist as Record<string, unknown> : {};
      const soll = item.soll && typeof item.soll === "object" ? item.soll as Record<string, unknown> : {};
      return {
        attributeId: String(item.attributeId),
        ist: snapshotAttribute(variables[String(ist.snapshotVariableId)], ist.snapshotAttributeId),
        soll: variables[String(soll.variableId)],
      };
    }),
  };
}

function statusFrom(checks: readonly WorkflowRuntimeShadowCheck[], issues: readonly string[]): WorkflowRuntimeShadowStatus {
  if (issues.length > 0 || checks.some((item) => item.status === "mismatch")) return "mismatch";
  if (checks.some((item) => item.status === "explained_deviation")) return "explained_deviation";
  return "equivalent";
}

export function compareLegacyChangeWithWorkflowShadow(input: WorkflowRuntimeShadowInput): WorkflowRuntimeShadowReport {
  if (!isShadowSlug(input.config.slug)) {
    return {
      changeTypeSlug: input.config.slug,
      status: "unsupported",
      checks: [],
      issues: [`Change type ${input.config.slug} is niet opgenomen in runtime shadow mode.`],
    };
  }

  const compiled = compileLegacyChangeType(input);
  const nodes = compiled.draft.nodes.map(toEditorNode);
  const variables = buildRuntimeVariables(nodes, input);
  const fields = formFieldIds(nodes);
  const runtimeFormData = Object.fromEntries(fields.map((field) => [field, variables[field] ?? null]));
  const classicFormData = Object.fromEntries(fields.map((field) => [field, input.formValues[field] ?? (field === "effective_date" ? input.effectiveDate : field === "rationale" ? input.rationale : null)]));
  const runtimeApplyPlan = plannedChangeRequest(nodes, variables);

  const checks: WorkflowRuntimeShadowCheck[] = [
    check("form_data", classicFormData, runtimeFormData),
    check("decisions", classicApprovalStakeholders(input.config), approvalNodeKeys(nodes)),
    check("staging", input.classicApplyPlan?.resourceId ?? null, runtimeApplyPlan?.resourceId ?? null, compiled.report.changeRequestWarning),
    check(
      "apply_plan",
      input.classicApplyPlan ?? null,
      runtimeApplyPlan,
      input.classicApplyPlan && !runtimeApplyPlan
        ? compiled.report.changeRequestWarning ?? "Legacy flow heeft nog geen runtime mutation-adapter; shadow mode verklaart dit als migratierestpunt."
        : compiled.report.changeRequestWarning,
    ),
  ];

  const issues: readonly string[] = [];
  return {
    changeTypeSlug: input.config.slug,
    status: statusFrom(checks, issues),
    workflowName: compiled.draft.name,
    workflowNodeCount: compiled.draft.nodes.length,
    workflowEdgeCount: compiled.draft.edges.length,
    checks,
    issues,
  };
}
