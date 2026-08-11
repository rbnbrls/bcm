import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildWorkflowAccessibilityModel } from "@/lib/workflow-studio/workflow-accessibility";
import type { WorkflowEditorEdge, WorkflowEditorNode } from "@/lib/workflow-studio/editor-model";

function node(id: string, label: string, x: number, y: number, blockType = "form"): WorkflowEditorNode {
  return {
    id,
    nodeKey: id,
    blockType,
    contractVersion: 1,
    label,
    description: label,
    configuration: {},
    position: { x, y },
  };
}

const nodes = [
  node("start", "Start aanvraag", 20, 10, "manual_start"),
  node("lookup", "Client zoeken", 240, 40, "client_config_lookup"),
  node("approval", "Vier-ogen controle", 520, 90, "approval"),
  node("end", "Einde", 760, 140, "end"),
] as const;

const edges: readonly WorkflowEditorEdge[] = [
  { id: "edge-1", edgeKey: "start_lookup", sourceNodeId: "start", sourcePort: "out", targetNodeId: "lookup", targetPort: "in" },
  { id: "edge-2", edgeKey: "lookup_approval", sourceNodeId: "lookup", sourcePort: "out", targetNodeId: "approval", targetPort: "in" },
  { id: "edge-3", edgeKey: "approval_end", sourceNodeId: "approval", sourcePort: "approved", targetNodeId: "end", targetPort: "in" },
];

describe("workflow accessibility model", () => {
  it("builds an ordered screenreader outline with connection counts", () => {
    const model = buildWorkflowAccessibilityModel({ nodes, edges, selectedNodeId: "approval" });

    expect(model.summary).toBe("4 blokken, 3 verbindingen, geselecteerd: Vier-ogen controle, geen zoekfilter actief");
    expect(model.outline.map((item) => item.id)).toEqual(["start", "lookup", "approval", "end"]);
    expect(model.outline.find((item) => item.id === "approval")).toMatchObject({
      incoming: 1,
      outgoing: 1,
      selected: true,
      matchesQuery: true,
    });
  });

  it("filters by label, node key or block type and keeps the minimap complete", () => {
    const model = buildWorkflowAccessibilityModel({ nodes, edges, selectedNodeId: "lookup", query: "approval" });

    expect(model.resultCount).toBe(1);
    expect(model.outline.map((item) => item.id)).toEqual(["approval"]);
    expect(model.minimap.nodes).toHaveLength(nodes.length);
    expect(model.minimap.edges).toHaveLength(edges.length);
    expect(model.minimap.nodes.find((item) => item.id === "approval")).toMatchObject({ matchesQuery: true });
    expect(model.minimap.nodes.find((item) => item.id === "start")).toMatchObject({ matchesQuery: false });
  });

  it("normalizes large workflow coordinates into a stable minimap range", () => {
    const largeNodes = Array.from({ length: 250 }, (_, index) => node(`node_${index}`, `Stap ${index}`, index * 48, (index % 12) * 110));
    const model = buildWorkflowAccessibilityModel({ nodes: largeNodes, edges: [] });

    expect(model.minimap.nodes).toHaveLength(250);
    expect(model.minimap.nodes.every((item) => item.x >= 0 && item.x <= 1 && item.y >= 0 && item.y <= 1)).toBe(true);
    expect(model.minimap.bounds.maxX).toBeGreaterThan(10_000);
  });

  it("keeps WCAG support hooks in the global stylesheet", () => {
    const css = readFileSync("app/globals.css", "utf8");

    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain(":focus-visible");
    expect(css).toContain(".workflow-minimap");
    expect(css).toContain(".workflow-keyboard-move");
  });
});
