import type { WorkflowEditorEdge, WorkflowEditorNode } from "@/lib/workflow-studio/editor-model";

export type WorkflowAccessibilityOutlineItem = {
  id: string;
  nodeKey: string;
  label: string;
  blockType: string;
  position: { x: number; y: number };
  incoming: number;
  outgoing: number;
  selected: boolean;
  matchesQuery: boolean;
};

export type WorkflowAccessibilityMinimapNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  selected: boolean;
  matchesQuery: boolean;
};

export type WorkflowAccessibilityMinimapEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
};

export type WorkflowAccessibilityModel = {
  summary: string;
  query: string;
  resultCount: number;
  outline: readonly WorkflowAccessibilityOutlineItem[];
  minimap: {
    empty: boolean;
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
    nodes: readonly WorkflowAccessibilityMinimapNode[];
    edges: readonly WorkflowAccessibilityMinimapEdge[];
  };
};

export function buildWorkflowAccessibilityModel(input: {
  nodes: readonly WorkflowEditorNode[];
  edges: readonly WorkflowEditorEdge[];
  selectedNodeId?: string | null;
  query?: string | null;
}): WorkflowAccessibilityModel {
  const query = (input.query ?? "").trim().toLowerCase();
  const incoming = new Map(input.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(input.nodes.map((node) => [node.id, 0]));
  const nodeIds = new Set(input.nodes.map((node) => node.id));
  for (const edge of input.edges) {
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) continue;
    outgoing.set(edge.sourceNodeId, (outgoing.get(edge.sourceNodeId) ?? 0) + 1);
    incoming.set(edge.targetNodeId, (incoming.get(edge.targetNodeId) ?? 0) + 1);
  }

  const sortedNodes = [...input.nodes].sort((a, b) =>
    a.position.y - b.position.y
    || a.position.x - b.position.x
    || a.nodeKey.localeCompare(b.nodeKey));
  const outline = sortedNodes.map((node) => {
    const haystack = `${node.label} ${node.nodeKey} ${node.blockType}`.toLowerCase();
    return {
      id: node.id,
      nodeKey: node.nodeKey,
      label: node.label,
      blockType: node.blockType,
      position: node.position,
      incoming: incoming.get(node.id) ?? 0,
      outgoing: outgoing.get(node.id) ?? 0,
      selected: node.id === input.selectedNodeId,
      matchesQuery: query.length === 0 || haystack.includes(query),
    };
  });

  const visibleOutline = query ? outline.filter((item) => item.matchesQuery) : outline;
  const minX = Math.min(0, ...input.nodes.map((node) => node.position.x));
  const minY = Math.min(0, ...input.nodes.map((node) => node.position.y));
  const maxX = Math.max(1, ...input.nodes.map((node) => node.position.x + 180));
  const maxY = Math.max(1, ...input.nodes.map((node) => node.position.y + 80));
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const minimapNodes = outline.map((node) => ({
    id: node.id,
    label: node.label,
    x: Number(((node.position.x - minX) / width).toFixed(4)),
    y: Number(((node.position.y - minY) / height).toFixed(4)),
    selected: node.selected,
    matchesQuery: node.matchesQuery,
  }));

  const selected = outline.find((node) => node.selected);
  const summary = [
    `${input.nodes.length} blokken`,
    `${input.edges.length} verbindingen`,
    selected ? `geselecteerd: ${selected.label}` : "geen blok geselecteerd",
    query ? `${visibleOutline.length} zoekresultaten` : "geen zoekfilter actief",
  ].join(", ");

  return {
    summary,
    query,
    resultCount: visibleOutline.length,
    outline: visibleOutline,
    minimap: {
      empty: input.nodes.length === 0,
      bounds: { minX, minY, maxX, maxY },
      nodes: minimapNodes,
      edges: input.edges
        .filter((edge) => nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId))
        .map((edge) => ({ id: edge.id, sourceNodeId: edge.sourceNodeId, targetNodeId: edge.targetNodeId })),
    },
  };
}
