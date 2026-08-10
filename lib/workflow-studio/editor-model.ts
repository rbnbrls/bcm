import type { BlockCatalogEntry } from "@/lib/workflow-studio/block-registry";
import type { BlockPortDefinition } from "@/lib/workflow-studio/block-contract";

export type WorkflowEditorPosition = { x: number; y: number };

export type WorkflowEditorNode = {
  id: string;
  nodeKey: string;
  blockType: string;
  contractVersion: number;
  label: string;
  description: string;
  configuration: unknown;
  position: WorkflowEditorPosition;
};

export type WorkflowEditorEdge = {
  id: string;
  edgeKey: string;
  sourceNodeId: string;
  sourcePort: string;
  targetNodeId: string;
  targetPort: string;
};

export type WorkflowEditorGraph = {
  nodes: readonly WorkflowEditorNode[];
  edges: readonly WorkflowEditorEdge[];
};

export type WorkflowEditorHistory = {
  past: readonly WorkflowEditorGraph[];
  present: WorkflowEditorGraph;
  future: readonly WorkflowEditorGraph[];
};

export type WorkflowEditorPortReference = { nodeId: string; portId: string };

export type WorkflowEditorConnectionDecision =
  | { compatible: true; source: BlockPortDefinition; target: BlockPortDefinition }
  | { compatible: false; reason: string };

export type WorkflowEditorValidationIssue = {
  code: "start_count" | "end_missing" | "disconnected_node" | "path_without_end";
  severity: "error" | "warning";
  nodeId?: string;
  message: string;
};

const defaultConfigurations: Readonly<Record<string, Readonly<Record<string, unknown>>>> = Object.freeze({
  manual_start: Object.freeze({
    label: "Handmatige start",
    starterRoleIds: Object.freeze(["aanvrager"]),
    dataScope: "workflow_default",
  }),
  end: Object.freeze({ outcome: "completed", label: "Einde" }),
  form: Object.freeze({ title: "Nieuw formulier", fields: Object.freeze([]) }),
  role_task: Object.freeze({ roleId: "uitvoerder", title: "Nieuwe taak", instructions: "Beschrijf de taak.", inputVariables: Object.freeze([]), outputVariables: Object.freeze([]) }),
  approval: Object.freeze({
    roleId: "goedkeurder",
    title: "Nieuwe goedkeuring",
    instructions: "Controleer de aangeleverde gegevens.",
    inputVariables: Object.freeze([]),
    decisionLabels: Object.freeze({ approved: "Goedkeuren", rejected: "Afwijzen", returned: "Terugsturen" }),
    requireCommentOnApprove: false,
    requireCommentOnReject: true,
    requireCommentOnReturn: true,
  }),
  client_config_lookup: Object.freeze({ resourceId: "client", filters: Object.freeze([]), displayFields: Object.freeze(["code", "name"]), outputVariable: "geselecteerde_client", selection: "one" }),
  change_request: Object.freeze({
    resourceId: "portfolio_configuration",
    operation: "UPDATE",
    attributeMappings: Object.freeze([Object.freeze({
      attributeId: "portfolio_code",
      ist: Object.freeze({ snapshotVariableId: "geselecteerde_configuratie", snapshotAttributeId: "portfolio_code" }),
      soll: Object.freeze({ variableId: "nieuw_portfolio_code" }),
    })]),
    effectiveDateVariable: "ingangsdatum",
    rationaleVariable: "toelichting",
  }),
  decision: Object.freeze({ label: "Nieuwe beslissing", rule: Object.freeze({ kind: "group", combinator: "AND", rules: Object.freeze([Object.freeze({ kind: "condition", variableId: "waarde", valueType: "string", operator: "exists" })]) }) }),
  notification: Object.freeze({ recipientRoleIds: Object.freeze(["ontvanger"]), channel: "in_app", trigger: "on_reached", subjectTemplate: "Workflowupdate", messageTemplate: "Er is een workflowupdate.", templateVariables: Object.freeze([]) }),
});

export function createWorkflowEditorNode(
  entry: BlockCatalogEntry,
  existingNodes: readonly WorkflowEditorNode[],
  id: string,
  position?: WorkflowEditorPosition,
): WorkflowEditorNode {
  const usedKeys = new Set(existingNodes.map((node) => node.nodeKey));
  let suffix = 1;
  while (usedKeys.has(`${entry.blockType}_${suffix}`)) suffix += 1;
  const column = existingNodes.length % 3;
  const row = Math.floor(existingNodes.length / 3);
  return {
    id,
    nodeKey: `${entry.blockType}_${suffix}`,
    blockType: entry.blockType,
    contractVersion: entry.contractVersion,
    label: entry.ui.label,
    description: entry.ui.description,
    configuration: structuredClone(defaultConfigurations[entry.blockType] ?? {}),
    position: position ?? { x: 64 + column * 220, y: 72 + row * 130 },
  };
}

export function moveWorkflowEditorNode(
  nodes: readonly WorkflowEditorNode[],
  nodeId: string,
  position: WorkflowEditorPosition,
): WorkflowEditorNode[] {
  return nodes.map((node) => node.id === nodeId
    ? { ...node, position: { x: Math.max(0, position.x), y: Math.max(0, position.y) } }
    : node);
}

export function updateWorkflowEditorNodeConfiguration(
  nodes: readonly WorkflowEditorNode[],
  nodeId: string,
  configuration: Readonly<Record<string, unknown>>,
): WorkflowEditorNode[] {
  return nodes.map((node) => {
    if (node.id !== nodeId) return node;
    const configuredLabel = typeof configuration.label === "string"
      ? configuration.label
      : typeof configuration.title === "string"
        ? configuration.title
        : "";
    const label = configuredLabel.trim() || node.label;
    return {
      ...node,
      label,
      configuration: structuredClone(configuration),
    };
  });
}

export function removeWorkflowEditorNode(
  nodes: readonly WorkflowEditorNode[],
  nodeId: string,
): WorkflowEditorNode[] {
  return nodes.filter((node) => node.id !== nodeId);
}

export function createWorkflowEditorHistory(graph: WorkflowEditorGraph): WorkflowEditorHistory {
  return { past: [], present: { nodes: [...graph.nodes], edges: [...graph.edges] }, future: [] };
}

export function commitWorkflowEditorGraph(
  history: WorkflowEditorHistory,
  graph: WorkflowEditorGraph,
): WorkflowEditorHistory {
  return {
    past: [...history.past, history.present],
    present: { nodes: [...graph.nodes], edges: [...graph.edges] },
    future: [],
  };
}

export function undoWorkflowEditorGraph(history: WorkflowEditorHistory): WorkflowEditorHistory {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoWorkflowEditorGraph(history: WorkflowEditorHistory): WorkflowEditorHistory {
  const next = history.future[0];
  if (!next) return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}

function catalogEntryForNode(
  catalog: readonly BlockCatalogEntry[],
  node: WorkflowEditorNode | undefined,
): BlockCatalogEntry | null {
  if (!node) return null;
  return catalog.find((entry) => entry.blockType === node.blockType && entry.contractVersion === node.contractVersion) ?? null;
}

export function canConnectWorkflowEditorPorts(
  catalog: readonly BlockCatalogEntry[],
  graph: WorkflowEditorGraph,
  sourceReference: WorkflowEditorPortReference,
  targetReference: WorkflowEditorPortReference,
): WorkflowEditorConnectionDecision {
  if (sourceReference.nodeId === targetReference.nodeId) {
    return { compatible: false, reason: "Een blok kan niet met zichzelf worden verbonden." };
  }
  const sourceNode = graph.nodes.find((node) => node.id === sourceReference.nodeId);
  const targetNode = graph.nodes.find((node) => node.id === targetReference.nodeId);
  const sourceEntry = catalogEntryForNode(catalog, sourceNode);
  const targetEntry = catalogEntryForNode(catalog, targetNode);
  const source = sourceEntry?.outputs.find((port) => port.id === sourceReference.portId);
  const target = targetEntry?.inputs.find((port) => port.id === targetReference.portId);
  if (!source || !target) return { compatible: false, reason: "De gekozen poort bestaat niet in het blockcontract." };
  if (source.valueType !== target.valueType && source.valueType !== "any" && target.valueType !== "any") {
    return { compatible: false, reason: `Poorttypes ${source.valueType} en ${target.valueType} zijn niet compatibel.` };
  }
  if (graph.edges.some((edge) =>
    edge.sourceNodeId === sourceReference.nodeId
    && edge.sourcePort === sourceReference.portId
    && edge.targetNodeId === targetReference.nodeId
    && edge.targetPort === targetReference.portId)) {
    return { compatible: false, reason: "Deze verbinding bestaat al." };
  }
  const sourceConnections = graph.edges.filter((edge) => edge.sourceNodeId === sourceReference.nodeId && edge.sourcePort === sourceReference.portId).length;
  if (source.maxConnections !== null && sourceConnections >= source.maxConnections) {
    return { compatible: false, reason: `${source.label} heeft het maximale aantal verbindingen bereikt.` };
  }
  const targetConnections = graph.edges.filter((edge) => edge.targetNodeId === targetReference.nodeId && edge.targetPort === targetReference.portId).length;
  if (target.maxConnections !== null && targetConnections >= target.maxConnections) {
    return { compatible: false, reason: `${target.label} heeft het maximale aantal verbindingen bereikt.` };
  }
  return { compatible: true, source, target };
}

export function connectWorkflowEditorPorts(
  catalog: readonly BlockCatalogEntry[],
  graph: WorkflowEditorGraph,
  source: WorkflowEditorPortReference,
  target: WorkflowEditorPortReference,
): WorkflowEditorGraph | null {
  if (!canConnectWorkflowEditorPorts(catalog, graph, source, target).compatible) return null;
  const sourceNode = graph.nodes.find((node) => node.id === source.nodeId);
  const targetNode = graph.nodes.find((node) => node.id === target.nodeId);
  if (!sourceNode || !targetNode) return null;
  const edgeKey = `${sourceNode.nodeKey}_${source.portId}_to_${targetNode.nodeKey}_${target.portId}`.replace(/[^a-zA-Z0-9_]/g, "_");
  return {
    nodes: graph.nodes,
    edges: [...graph.edges, {
      id: `edge:${source.nodeId}:${source.portId}:${target.nodeId}:${target.portId}`,
      edgeKey,
      sourceNodeId: source.nodeId,
      sourcePort: source.portId,
      targetNodeId: target.nodeId,
      targetPort: target.portId,
    }],
  };
}

export function removeWorkflowEditorEdge(
  graph: WorkflowEditorGraph,
  edgeId: string,
): WorkflowEditorGraph {
  return { nodes: graph.nodes, edges: graph.edges.filter((edge) => edge.id !== edgeId) };
}

export function autoLayoutWorkflowEditorGraph(graph: WorkflowEditorGraph): WorkflowEditorGraph {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const incoming = new Map(graph.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!nodesById.has(edge.sourceNodeId) || !nodesById.has(edge.targetNodeId)) continue;
    incoming.set(edge.targetNodeId, (incoming.get(edge.targetNodeId) ?? 0) + 1);
    outgoing.set(edge.sourceNodeId, [...(outgoing.get(edge.sourceNodeId) ?? []), edge.targetNodeId]);
  }
  const queue = graph.nodes.filter((node) => incoming.get(node.id) === 0).sort((a, b) => a.nodeKey.localeCompare(b.nodeKey));
  const depth = new Map(queue.map((node) => [node.id, 0]));
  const ordered: WorkflowEditorNode[] = [];
  while (queue.length) {
    const node = queue.shift();
    if (!node) break;
    ordered.push(node);
    for (const targetId of [...(outgoing.get(node.id) ?? [])].sort()) {
      depth.set(targetId, Math.max(depth.get(targetId) ?? 0, (depth.get(node.id) ?? 0) + 1));
      incoming.set(targetId, (incoming.get(targetId) ?? 1) - 1);
      if (incoming.get(targetId) === 0) {
        const target = nodesById.get(targetId);
        if (target) queue.push(target);
        queue.sort((a, b) => a.nodeKey.localeCompare(b.nodeKey));
      }
    }
  }
  const remaining = graph.nodes.filter((node) => !ordered.some((item) => item.id === node.id)).sort((a, b) => a.nodeKey.localeCompare(b.nodeKey));
  for (const node of remaining) depth.set(node.id, depth.get(node.id) ?? 0);
  const all = [...ordered, ...remaining];
  const rowsPerDepth = new Map<number, number>();
  return {
    edges: graph.edges,
    nodes: all.map((node) => {
      const column = depth.get(node.id) ?? 0;
      const row = rowsPerDepth.get(column) ?? 0;
      rowsPerDepth.set(column, row + 1);
      return { ...node, position: { x: 70 + column * 240, y: 70 + row * 130 } };
    }),
  };
}

export function validateWorkflowEditorShell(
  nodes: readonly WorkflowEditorNode[],
  edges: readonly WorkflowEditorEdge[],
): WorkflowEditorValidationIssue[] {
  const issues: WorkflowEditorValidationIssue[] = [];
  const starts = nodes.filter((node) => node.blockType === "manual_start");
  if (starts.length !== 1) {
    issues.push({ code: "start_count", severity: "error", message: `De workflow vereist precies één startblok; gevonden: ${starts.length}.` });
  }
  if (!nodes.some((node) => node.blockType === "end")) {
    issues.push({ code: "end_missing", severity: "error", message: "De workflow vereist minimaal één eindblok." });
  }
  const connectedIds = new Set(edges.flatMap((edge) => [edge.sourceNodeId, edge.targetNodeId]));
  const outgoingIds = new Set(edges.map((edge) => edge.sourceNodeId));
  for (const node of nodes) {
    if (nodes.length > 1 && !connectedIds.has(node.id)) {
      issues.push({
        code: "disconnected_node",
        severity: "warning",
        nodeId: node.id,
        message: `${node.label} is nog niet verbonden.`,
      });
    }
    if (node.blockType !== "end" && !outgoingIds.has(node.id)) {
      issues.push({
        code: "path_without_end",
        severity: "error",
        nodeId: node.id,
        message: `Het pad eindigt bij ${node.label} zonder expliciet eindblok.`,
      });
    }
  }
  return issues;
}
