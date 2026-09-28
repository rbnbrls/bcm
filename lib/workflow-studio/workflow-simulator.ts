import { evaluateWorkflowDecision } from "@/lib/workflow-studio/decision-schema";
import type { WorkflowEditorEdge, WorkflowEditorNode } from "@/lib/workflow-studio/editor-model";
import { workflowChangeRequestConfigurationSchema } from "@/lib/workflow-studio/change-request-schema";
import { validateWorkflowFormSubmission, workflowFormBlockConfigurationSchema, type WorkflowFormField } from "@/lib/workflow-studio/form-schema";
import { workflowLookupConfigurationSchema } from "@/lib/workflow-studio/lookup-schema";
import { renderWorkflowNotification, workflowNotificationConfigurationSchema } from "@/lib/workflow-studio/notification-schema";

export type WorkflowSimulationTaskOutcome = {
  outcome?: "approved" | "rejected" | "returned";
  outputs?: Readonly<Record<string, unknown>>;
};

export type WorkflowSimulationInput = {
  variables?: Readonly<Record<string, unknown>>;
  taskOutcomes?: Readonly<Record<string, WorkflowSimulationTaskOutcome>>;
  lookupFixtures?: Readonly<Record<string, unknown>>;
};

export type WorkflowSimulationIntent =
  | {
      kind: "change_request";
      nodeKey: string;
      resourceId: string;
      operation: "CREATE" | "UPDATE" | "RETIRE";
      effectiveDate: unknown;
      rationale: unknown;
      attributes: readonly { attributeId: string; ist: unknown; soll: unknown }[];
    }
  | {
      kind: "notification";
      nodeKey: string;
      channel: "in_app" | "email";
      recipients: readonly string[];
      trigger: "on_reached" | "on_workflow_completed" | "on_workflow_failed";
      subject?: string;
      message?: string;
    };

export type WorkflowSimulationAuditEvent = {
  sequence: number;
  type: string;
  nodeKey?: string;
  detail: string;
};

export type WorkflowSimulationDecision = {
  nodeKey: string;
  matched: boolean;
  outputPort: "matched" | "otherwise";
  explanation: string;
};

export type WorkflowSimulationResult = {
  status: "completed" | "stopped" | "invalid";
  visitedNodeKeys: readonly string[];
  variables: Readonly<Record<string, unknown>>;
  decisions: readonly WorkflowSimulationDecision[];
  intents: readonly WorkflowSimulationIntent[];
  auditEvents: readonly WorkflowSimulationAuditEvent[];
  issues: readonly string[];
};

export type WorkflowSimulationControls = {
  formFields: readonly { nodeKey: string; field: WorkflowFormField }[];
  additionalVariables: readonly string[];
  tasks: readonly { nodeKey: string; title: string; outputVariables: readonly string[] }[];
  approvals: readonly { nodeKey: string; title: string; labels: Readonly<Record<"approved" | "rejected" | "returned", string>> }[];
  lookups: readonly { nodeKey: string; outputVariable: string; selection: "one" | "many" }[];
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function conditionVariables(rule: unknown): string[] {
  const value = record(rule);
  if (value.kind === "condition" && typeof value.variableId === "string") return [value.variableId];
  return Array.isArray(value.rules) ? value.rules.flatMap(conditionVariables) : [];
}

export function collectWorkflowSimulationControls(nodes: readonly WorkflowEditorNode[]): WorkflowSimulationControls {
  const formFields: Array<{ nodeKey: string; field: WorkflowFormField }> = [];
  const writtenVariables = new Set<string>();
  const readVariables = new Set<string>();
  const tasks: WorkflowSimulationControls["tasks"][number][] = [];
  const approvals: WorkflowSimulationControls["approvals"][number][] = [];
  const lookups: WorkflowSimulationControls["lookups"][number][] = [];

  for (const node of nodes) {
    const configuration = record(node.configuration);
    if (node.blockType === "form") {
      const parsed = workflowFormBlockConfigurationSchema.safeParse(node.configuration);
      if (parsed.success) for (const field of parsed.data.fields) {
        formFields.push({ nodeKey: node.nodeKey, field });
        writtenVariables.add(field.id);
      }
    }
    if (node.blockType === "role_task") {
      const outputs = Array.isArray(configuration.outputVariables)
        ? configuration.outputVariables.filter((value): value is string => typeof value === "string")
        : [];
      outputs.forEach((value) => writtenVariables.add(value));
      tasks.push({ nodeKey: node.nodeKey, title: typeof configuration.title === "string" ? configuration.title : node.label, outputVariables: outputs });
    }
    if (node.blockType === "approval") {
      const labels = record(configuration.decisionLabels);
      approvals.push({
        nodeKey: node.nodeKey,
        title: typeof configuration.title === "string" ? configuration.title : node.label,
        labels: {
          approved: typeof labels.approved === "string" ? labels.approved : "Goedkeuren",
          rejected: typeof labels.rejected === "string" ? labels.rejected : "Afwijzen",
          returned: typeof labels.returned === "string" ? labels.returned : "Terugsturen",
        },
      });
    }
    if (node.blockType === "client_config_lookup") {
      const parsed = workflowLookupConfigurationSchema.safeParse(node.configuration);
      if (parsed.success) {
        writtenVariables.add(parsed.data.outputVariable);
        lookups.push({ nodeKey: node.nodeKey, outputVariable: parsed.data.outputVariable, selection: parsed.data.selection });
      }
    }
    if (node.blockType === "decision") conditionVariables(configuration.rule).forEach((value) => readVariables.add(value));
    if (node.blockType === "change_request") {
      for (const name of [configuration.effectiveDateVariable, configuration.rationaleVariable]) if (typeof name === "string") readVariables.add(name);
      if (Array.isArray(configuration.attributeMappings)) for (const mapping of configuration.attributeMappings) {
        const item = record(mapping);
        const ist = record(item.ist);
        const soll = record(item.soll);
        if (typeof ist.snapshotVariableId === "string") readVariables.add(ist.snapshotVariableId);
        if (typeof soll.variableId === "string") readVariables.add(soll.variableId);
      }
    }
    if (node.blockType === "notification" && Array.isArray(configuration.templateVariables)) {
      configuration.templateVariables.forEach((value) => { if (typeof value === "string") readVariables.add(value); });
    }
  }

  return {
    formFields,
    additionalVariables: [...readVariables].filter((value) => !writtenVariables.has(value)).sort(),
    tasks,
    approvals,
    lookups,
  };
}

function snapshotAttribute(snapshot: unknown, attributeId: unknown): unknown {
  return typeof attributeId === "string" ? record(snapshot)[attributeId] : undefined;
}

export function simulateWorkflowPath(
  nodes: readonly WorkflowEditorNode[],
  edges: readonly WorkflowEditorEdge[],
  input: WorkflowSimulationInput = {},
): WorkflowSimulationResult {
  const variables: Record<string, unknown> = structuredClone(input.variables ?? {});
  const visitedNodeKeys: string[] = [];
  const decisions: WorkflowSimulationDecision[] = [];
  const intents: WorkflowSimulationIntent[] = [];
  const auditEvents: WorkflowSimulationAuditEvent[] = [];
  const issues: string[] = [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, WorkflowEditorEdge[]>();
  for (const edge of edges) outgoing.set(edge.sourceNodeId, [...(outgoing.get(edge.sourceNodeId) ?? []), edge]);
  for (const list of outgoing.values()) list.sort((left, right) => left.edgeKey.localeCompare(right.edgeKey));
  const starts = nodes.filter((node) => node.blockType === "manual_start");
  const audit = (type: string, detail: string, nodeKey?: string) => auditEvents.push({ sequence: auditEvents.length + 1, type, ...(nodeKey ? { nodeKey } : {}), detail });

  if (starts.length !== 1) {
    issues.push(`Simulatie vereist precies één startblok; gevonden: ${starts.length}.`);
    audit("simulation.invalid", issues[0]!);
    return { status: "invalid", visitedNodeKeys, variables, decisions, intents, auditEvents, issues };
  }

  audit("simulation.started", "Side-effectvrije simulatie gestart met lokale fixtures.");
  let current: WorkflowEditorNode | undefined = starts[0];
  const visitedIds = new Set<string>();
  while (current) {
    if (visitedIds.has(current.id)) {
      issues.push(`Cyclus gedetecteerd bij ${current.nodeKey}; simulatie gestopt.`);
      audit("simulation.cycle_detected", issues.at(-1)!, current.nodeKey);
      return { status: "invalid", visitedNodeKeys, variables, decisions, intents, auditEvents, issues };
    }
    visitedIds.add(current.id);
    visitedNodeKeys.push(current.nodeKey);
    audit("node.entered", `${current.label} bezocht.`, current.nodeKey);
    const configuration = record(current.configuration);
    let selectedPort: string | undefined;

    if (current.blockType === "form") {
      const parsed = workflowFormBlockConfigurationSchema.safeParse(current.configuration);
      if (parsed.success) for (const field of parsed.data.fields) {
        if (variables[field.id] === undefined && field.defaultValue !== undefined) variables[field.id] = structuredClone(field.defaultValue);
      }
      if (parsed.success) {
        const submission = Object.fromEntries(parsed.data.fields
          .filter((field) => Object.hasOwn(variables, field.id))
          .map((field) => [field.id, variables[field.id]]));
        const validated = validateWorkflowFormSubmission(parsed.data, submission);
        if (!validated.success) {
          issues.push(...validated.error.issues.map((item) => `${item.path.join(".") || current!.nodeKey}: ${item.message}`));
          audit("form.invalid", issues.at(-1) ?? "Formulierfixture ongeldig.", current.nodeKey);
          return { status: "invalid", visitedNodeKeys, variables, decisions, intents, auditEvents, issues };
        }
      }
      audit("form.submitted", "Formulierfixture als variabelen toegepast.", current.nodeKey);
    }
    if (current.blockType === "role_task") {
      const outcome = input.taskOutcomes?.[current.nodeKey];
      const declaredOutputs = Array.isArray(configuration.outputVariables)
        ? configuration.outputVariables.filter((value): value is string => typeof value === "string")
        : [];
      const selectedOutputs = Object.fromEntries(Object.entries(outcome?.outputs ?? {}).filter(([name]) => declaredOutputs.includes(name)));
      Object.assign(variables, structuredClone(selectedOutputs));
      audit("task.completed", `Taakuitvoer toegepast: ${Object.keys(selectedOutputs).join(", ") || "geen"}.`, current.nodeKey);
    }
    if (current.blockType === "approval") {
      selectedPort = input.taskOutcomes?.[current.nodeKey]?.outcome ?? "approved";
      audit("approval.completed", `Gekozen uitkomst: ${selectedPort}.`, current.nodeKey);
    }
    if (current.blockType === "client_config_lookup") {
      const parsed = workflowLookupConfigurationSchema.safeParse(current.configuration);
      if (parsed.success) {
        const fixture = structuredClone(input.lookupFixtures?.[current.nodeKey]);
        const validShape = parsed.data.selection === "many" ? Array.isArray(fixture) : Boolean(fixture && typeof fixture === "object" && !Array.isArray(fixture));
        if (!validShape) {
          issues.push(`Lookupfixture voor ${current.nodeKey} moet ${parsed.data.selection === "many" ? "een lijst" : "een object"} zijn.`);
          audit("lookup.fixture_invalid", issues.at(-1)!, current.nodeKey);
          return { status: "invalid", visitedNodeKeys, variables, decisions, intents, auditEvents, issues };
        }
        variables[parsed.data.outputVariable] = fixture;
        audit("lookup.fixture_loaded", `Lokale gemaskeerde fixture naar ${parsed.data.outputVariable} geschreven.`, current.nodeKey);
      }
    }
    if (current.blockType === "decision") {
      const evaluation = evaluateWorkflowDecision(current.configuration, variables);
      if (!evaluation.valid) {
        issues.push(...evaluation.issues.map((item) => item.message));
        audit("decision.invalid", issues.at(-1) ?? "Beslissing ongeldig.", current.nodeKey);
        return { status: "invalid", visitedNodeKeys, variables, decisions, intents, auditEvents, issues };
      }
      const outputPort = evaluation.matched ? "matched" as const : "otherwise" as const;
      selectedPort = outputPort;
      decisions.push({ nodeKey: current.nodeKey, matched: evaluation.matched, outputPort, explanation: evaluation.explanation });
      audit("decision.evaluated", evaluation.explanation, current.nodeKey);
    }
    if (current.blockType === "change_request") {
      const parsed = workflowChangeRequestConfigurationSchema.safeParse(current.configuration);
      if (parsed.success) {
        intents.push({
          kind: "change_request",
          nodeKey: current.nodeKey,
          resourceId: parsed.data.resourceId,
          operation: parsed.data.operation,
          effectiveDate: variables[parsed.data.effectiveDateVariable],
          rationale: variables[parsed.data.rationaleVariable],
          attributes: parsed.data.attributeMappings.map((mapping) => ({
            attributeId: mapping.attributeId,
            ist: mapping.ist ? snapshotAttribute(variables[mapping.ist.snapshotVariableId], mapping.ist.snapshotAttributeId) : undefined,
            soll: mapping.soll ? variables[mapping.soll.variableId] : undefined,
          })),
        });
        audit("intent.planned", `${parsed.data.operation} voor ${parsed.data.resourceId} gepland; niets geschreven.`, current.nodeKey);
      }
    }
    if (current.blockType === "notification") {
      const parsed = workflowNotificationConfigurationSchema.safeParse(current.configuration);
      if (parsed.success) {
        const rendered = renderWorkflowNotification(parsed.data, variables);
        intents.push({
          kind: "notification",
          nodeKey: current.nodeKey,
          channel: parsed.data.channel,
          recipients: parsed.data.recipientRoleIds,
          trigger: parsed.data.trigger,
          ...(rendered.valid ? { subject: rendered.subject, message: rendered.message } : {}),
        });
        audit("notification.planned", `Notificatie via ${parsed.data.channel} gepland; niets verzonden.`, current.nodeKey);
      }
    }
    if (current.blockType === "end") {
      audit("workflow.completed", `Einduitkomst: ${String(configuration.outcome ?? "completed")}.`, current.nodeKey);
      return { status: "completed", visitedNodeKeys, variables, decisions, intents, auditEvents, issues };
    }

    const choices = outgoing.get(current.id) ?? [];
    const nextEdge = selectedPort ? choices.find((edge) => edge.sourcePort === selectedPort) : choices[0];
    if (!nextEdge) {
      issues.push(`Geen vervolgverbinding gevonden na ${current.nodeKey}${selectedPort ? ` voor uitgang ${selectedPort}` : ""}.`);
      audit("simulation.stopped", issues.at(-1)!, current.nodeKey);
      return { status: "stopped", visitedNodeKeys, variables, decisions, intents, auditEvents, issues };
    }
    current = byId.get(nextEdge.targetNodeId);
    if (!current) {
      issues.push(`Doelnode van edge ${nextEdge.edgeKey} bestaat niet.`);
      audit("simulation.invalid", issues.at(-1)!);
      return { status: "invalid", visitedNodeKeys, variables, decisions, intents, auditEvents, issues };
    }
  }

  return { status: "stopped", visitedNodeKeys, variables, decisions, intents, auditEvents, issues };
}
