import type { PublicChangeRequestCatalogResource } from "@/lib/workflow-studio/data-catalog";
import type { BlockCatalogEntry } from "@/lib/workflow-studio/block-registry";
import type { WorkflowCostModel } from "@/lib/workflow-studio/definition-schema";
import type { WorkflowEditorEdge, WorkflowEditorNode } from "@/lib/workflow-studio/editor-model";
import { workflowChangeRequestConfigurationSchema } from "@/lib/workflow-studio/change-request-schema";
import { workflowFormBlockConfigurationSchema, type WorkflowFormBlockConfiguration } from "@/lib/workflow-studio/form-schema";

export type WorkflowPreviewMetadata = {
  name: string;
  description: string;
  catalogDescription: string;
  costModel: WorkflowCostModel;
};

export type WorkflowPreviewRoleBinding = {
  workflowRole: string;
  identityGroup: string;
};

export type WorkflowPreviewRole = {
  id: string;
  contexts: readonly string[];
  identityGroups: readonly string[];
};

export type WorkflowPreviewChange = {
  nodeId: string;
  title: string;
  resource: string;
  operation: "CREATE" | "UPDATE" | "RETIRE";
  mappings: readonly {
    attribute: string;
    ist: string;
    soll: string;
  }[];
  effectiveDateVariable: string;
  rationaleVariable: string;
};

export type WorkflowPreviewStep = {
  nodeId: string;
  title: string;
  description: string;
  blockType: string;
  roleId?: string;
  deadlineHours?: number;
  branches: readonly string[];
};

export type WorkflowPreviewModel = {
  metadata: WorkflowPreviewMetadata;
  forms: readonly { nodeId: string; configuration: WorkflowFormBlockConfiguration }[];
  changes: readonly WorkflowPreviewChange[];
  roles: readonly WorkflowPreviewRole[];
  steps: readonly WorkflowPreviewStep[];
  slaHours: number | null;
  incompleteSections: readonly string[];
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringValues(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [];
}

function operationLabel(operation: WorkflowPreviewChange["operation"]): string {
  return operation === "CREATE" ? "Aanmaken" : operation === "UPDATE" ? "Wijzigen" : "Beëindigen";
}

function collectRoles(
  nodes: readonly WorkflowEditorNode[],
  roleBindings: readonly WorkflowPreviewRoleBinding[],
): WorkflowPreviewRole[] {
  const contexts = new Map<string, Set<string>>();
  const add = (roleId: string, context: string) => {
    const current = contexts.get(roleId) ?? new Set<string>();
    current.add(context);
    contexts.set(roleId, current);
  };

  for (const node of nodes) {
    const configuration = record(node.configuration);
    if (node.blockType === "manual_start") {
      for (const roleId of stringValues(configuration.starterRoleIds)) add(roleId, "Mag aanvragen");
    }
    if (node.blockType === "role_task" || node.blockType === "approval") {
      const roleId = stringValue(configuration.roleId);
      if (roleId) add(roleId, node.blockType === "approval" ? "Keurt goed" : "Voert taak uit");
    }
    if (node.blockType === "notification") {
      for (const roleId of stringValues(configuration.recipientRoleIds)) add(roleId, "Ontvangt notificatie");
    }
  }

  return [...contexts.entries()].sort(([left], [right]) => left.localeCompare(right, "nl")).map(([id, roleContexts]) => ({
    id,
    contexts: [...roleContexts],
    identityGroups: [...new Set(roleBindings.filter((binding) => binding.workflowRole === id).map((binding) => binding.identityGroup))].sort(),
  }));
}

function orderedNodes(nodes: readonly WorkflowEditorNode[], edges: readonly WorkflowEditorEdge[]): WorkflowEditorNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, WorkflowEditorEdge[]>();
  for (const edge of edges) {
    const current = outgoing.get(edge.sourceNodeId) ?? [];
    current.push(edge);
    outgoing.set(edge.sourceNodeId, current);
  }
  for (const list of outgoing.values()) list.sort((left, right) => left.sourcePort.localeCompare(right.sourcePort) || left.edgeKey.localeCompare(right.edgeKey));

  const visited = new Set<string>();
  const result: WorkflowEditorNode[] = [];
  const visit = (nodeId: string) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = byId.get(nodeId);
    if (!node) return;
    result.push(node);
    for (const edge of outgoing.get(nodeId) ?? []) visit(edge.targetNodeId);
  };
  const starts = nodes.filter((node) => node.blockType === "manual_start").sort((a, b) => a.nodeKey.localeCompare(b.nodeKey));
  for (const start of starts) visit(start.id);
  for (const node of [...nodes].sort((a, b) => a.nodeKey.localeCompare(b.nodeKey))) visit(node.id);
  return result;
}

function longestSlaHours(nodes: readonly WorkflowEditorNode[], edges: readonly WorkflowEditorEdge[]): number | null {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) outgoing.set(edge.sourceNodeId, [...(outgoing.get(edge.sourceNodeId) ?? []), edge.targetNodeId]);
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const duration = (node: WorkflowEditorNode) => {
    const value = record(node.configuration).deadlineHours;
    return node.blockType === "role_task" && typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
  };
  const visit = (nodeId: string): number => {
    if (memo.has(nodeId)) return memo.get(nodeId)!;
    if (visiting.has(nodeId)) return 0;
    visiting.add(nodeId);
    const children = (outgoing.get(nodeId) ?? []).map(visit);
    visiting.delete(nodeId);
    const total = duration(byId.get(nodeId) ?? ({ blockType: "", configuration: {} } as WorkflowEditorNode)) + Math.max(0, ...children);
    memo.set(nodeId, total);
    return total;
  };
  const starts = nodes.filter((node) => node.blockType === "manual_start");
  const total = Math.max(0, ...(starts.length ? starts : nodes).map((node) => visit(node.id)));
  return total > 0 ? total : null;
}

export function buildWorkflowPreviewModel({
  metadata,
  nodes,
  edges,
  roleBindings = [],
  changeRequestCatalog = [],
  blockCatalog = [],
}: {
  metadata: WorkflowPreviewMetadata;
  nodes: readonly WorkflowEditorNode[];
  edges: readonly WorkflowEditorEdge[];
  roleBindings?: readonly WorkflowPreviewRoleBinding[];
  changeRequestCatalog?: readonly PublicChangeRequestCatalogResource[];
  blockCatalog?: readonly BlockCatalogEntry[];
}): WorkflowPreviewModel {
  const incompleteSections = new Set<string>();
  const forms = nodes.filter((node) => node.blockType === "form").flatMap((node) => {
    const parsed = workflowFormBlockConfigurationSchema.safeParse(node.configuration);
    if (!parsed.success) {
      incompleteSections.add(`Formulier ‘${node.label}’ bevat nog ongeldige configuratie.`);
      return [];
    }
    return [{ nodeId: node.id, configuration: parsed.data }];
  });

  const changes = nodes.filter((node) => node.blockType === "change_request").flatMap((node) => {
    const parsed = workflowChangeRequestConfigurationSchema.safeParse(node.configuration);
    if (!parsed.success) {
      incompleteSections.add(`Wijzigingsverzoek ‘${node.label}’ bevat nog ongeldige configuratie.`);
      return [];
    }
    const resource = changeRequestCatalog.find((candidate) => candidate.id === parsed.data.resourceId);
    return [{
      nodeId: node.id,
      title: node.label,
      resource: resource?.label ?? parsed.data.resourceId,
      operation: parsed.data.operation,
      mappings: parsed.data.attributeMappings.map((mapping) => ({
        attribute: resource?.attributes.find((attribute) => attribute.id === mapping.attributeId)?.label ?? mapping.attributeId,
        ist: mapping.ist ? `${mapping.ist.snapshotVariableId}.${mapping.ist.snapshotAttributeId}` : "—",
        soll: mapping.soll?.variableId ?? (parsed.data.operation === "RETIRE" ? "Beëindigen" : "—"),
      })),
      effectiveDateVariable: parsed.data.effectiveDateVariable,
      rationaleVariable: parsed.data.rationaleVariable,
    }];
  });

  const outgoing = new Map<string, WorkflowEditorEdge[]>();
  for (const edge of edges) outgoing.set(edge.sourceNodeId, [...(outgoing.get(edge.sourceNodeId) ?? []), edge]);
  const steps = orderedNodes(nodes, edges).map((node) => {
    const configuration = record(node.configuration);
    const roleId = stringValue(configuration.roleId);
    const deadlineHours = node.blockType === "role_task" && typeof configuration.deadlineHours === "number"
      ? configuration.deadlineHours
      : undefined;
    return {
      nodeId: node.id,
      title: stringValue(configuration.title) ?? stringValue(configuration.label) ?? node.label,
      description: stringValue(configuration.instructions) ?? stringValue(configuration.description) ?? node.description,
      blockType: node.blockType,
      ...(roleId ? { roleId } : {}),
      ...(deadlineHours ? { deadlineHours } : {}),
      branches: (outgoing.get(node.id) ?? []).map((edge) => blockCatalog
        .find((entry) => entry.blockType === node.blockType && entry.contractVersion === node.contractVersion)
        ?.outputs.find((port) => port.id === edge.sourcePort)?.label ?? edge.sourcePort),
    };
  });

  if (forms.length === 0) incompleteSections.add("Er is nog geen geldig aanvraagformulier.");
  return {
    metadata,
    forms,
    changes,
    roles: collectRoles(nodes, roleBindings),
    steps,
    slaHours: longestSlaHours(nodes, edges),
    incompleteSections: [...incompleteSections],
  };
}

export { operationLabel as workflowPreviewOperationLabel };
