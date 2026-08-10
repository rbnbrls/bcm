import type { WorkflowEdgeInput, WorkflowNodeInput, WorkflowRoleBindingInput } from "@/lib/workflow-studio/definition-schema";
import type { WorkflowEditorGraph } from "@/lib/workflow-studio/editor-model";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const WORKFLOW_AUTOSAVE_SCHEMA_VERSION = 1 as const;

export type WorkflowAutosaveRequest = {
  definitionId: string;
  expectedRevision: number;
  nodes: WorkflowNodeInput[];
  edges: WorkflowEdgeInput[];
  roleBindings: WorkflowRoleBindingInput[];
};

export type WorkflowLocalDraftSnapshot = {
  schemaVersion: typeof WORKFLOW_AUTOSAVE_SCHEMA_VERSION;
  definitionId: string;
  baseRevision: string;
  savedAt: string;
  graph: WorkflowEditorGraph;
};

export function workflowGraphSignature(graph: WorkflowEditorGraph): string {
  return JSON.stringify({
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      nodeKey: node.nodeKey,
      blockType: node.blockType,
      contractVersion: node.contractVersion,
      configuration: node.configuration,
      position: node.position,
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      edgeKey: edge.edgeKey,
      sourceNodeId: edge.sourceNodeId,
      sourcePort: edge.sourcePort,
      targetNodeId: edge.targetNodeId,
      targetPort: edge.targetPort,
    })),
  });
}

export function workflowLocalDraftStorageKey(definitionId: string): string {
  return `bcm:workflow-studio:local-draft:${definitionId}`;
}

export function createWorkflowLocalDraftSnapshot(
  definitionId: string,
  baseRevision: string,
  graph: WorkflowEditorGraph,
  savedAt = new Date().toISOString(),
): WorkflowLocalDraftSnapshot {
  return {
    schemaVersion: WORKFLOW_AUTOSAVE_SCHEMA_VERSION,
    definitionId,
    baseRevision,
    savedAt,
    graph: structuredClone(graph),
  };
}

export function parseWorkflowLocalDraftSnapshot(value: string, definitionId: string): WorkflowLocalDraftSnapshot | null {
  try {
    const parsed = JSON.parse(value) as Partial<WorkflowLocalDraftSnapshot>;
    if (parsed.schemaVersion !== WORKFLOW_AUTOSAVE_SCHEMA_VERSION || parsed.definitionId !== definitionId) return null;
    if (typeof parsed.baseRevision !== "string" || typeof parsed.savedAt !== "string") return null;
    if (!parsed.graph || !Array.isArray(parsed.graph.nodes) || !Array.isArray(parsed.graph.edges)) return null;
    if (parsed.graph.nodes.some((node) => !node || typeof node.id !== "string" || typeof node.nodeKey !== "string" || typeof node.blockType !== "string" || typeof node.contractVersion !== "number" || !node.position || typeof node.position.x !== "number" || typeof node.position.y !== "number")) return null;
    if (parsed.graph.edges.some((edge) => !edge || typeof edge.id !== "string" || typeof edge.edgeKey !== "string" || typeof edge.sourceNodeId !== "string" || typeof edge.targetNodeId !== "string" || typeof edge.sourcePort !== "string" || typeof edge.targetPort !== "string")) return null;
    return parsed as WorkflowLocalDraftSnapshot;
  } catch {
    return null;
  }
}

export function toWorkflowAutosaveRequest(
  definitionId: string,
  expectedRevision: string,
  graph: WorkflowEditorGraph,
  roleBindings: readonly WorkflowRoleBindingInput[],
): WorkflowAutosaveRequest {
  return {
    definitionId,
    expectedRevision: Number(expectedRevision),
    nodes: graph.nodes.map((node) => ({
      ...(UUID_PATTERN.test(node.id) ? { id: node.id } : {}),
      nodeKey: node.nodeKey,
      block: { blockType: node.blockType, contractVersion: node.contractVersion },
      configuration: structuredClone(node.configuration),
      position: { ...node.position },
    })),
    edges: graph.edges.map((edge) => ({
      ...(UUID_PATTERN.test(edge.id) ? { id: edge.id } : {}),
      edgeKey: edge.edgeKey,
      sourceNodeId: edge.sourceNodeId,
      sourcePort: edge.sourcePort,
      targetNodeId: edge.targetNodeId,
      targetPort: edge.targetPort,
      condition: null,
    })),
    roleBindings: roleBindings.map((binding) => ({ ...binding, ...(binding.clientIds ? { clientIds: [...binding.clientIds] } : {}) })),
  };
}
