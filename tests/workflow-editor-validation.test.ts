import { describe, expect, it } from "vitest";
import type { BlockCatalogEntry } from "@/lib/workflow-studio/block-registry";
import type { WorkflowEditorNode } from "@/lib/workflow-studio/editor-model";
import { applyWorkflowEditorQuickFix, validateWorkflowEditorDraft } from "@/lib/workflow-studio/editor-validation";

const flowPort = { id: "out", label: "Uit", valueType: "flow" as const, required: true, maxConnections: 1 };
const inputPort = { id: "in", label: "In", valueType: "flow" as const, required: true, maxConnections: 1 };
const baseEntry: BlockCatalogEntry = {
  blockType: "manual_start",
  contractVersion: 1,
  configurationSchema: { type: "object", properties: {}, additionalProperties: false },
  configurationUiSchema: { fieldOrder: [], widgets: {} },
  inputs: [],
  outputs: [flowPort],
  capabilities: ["start"],
  ui: { label: "Start", description: "Start", category: "control", icon: "play", order: 1 },
};
const endEntry: BlockCatalogEntry = {
  ...baseEntry,
  blockType: "end",
  configurationSchema: {
    type: "object",
    properties: { label: { type: "string" }, outcome: { type: "string", enum: ["completed", "rejected", "cancelled"] } },
    additionalProperties: false,
  },
  inputs: [inputPort],
  outputs: [],
  capabilities: ["end"],
  ui: { ...baseEntry.ui, label: "Einde", order: 2 },
};
const mappingEntry: BlockCatalogEntry = {
  ...baseEntry,
  blockType: "mapped_task",
  configurationSchema: {
    type: "object",
    properties: { sourceVariable: { type: "string", minLength: 1 } },
    required: ["sourceVariable"],
    additionalProperties: false,
  },
  configurationUiSchema: { fieldOrder: ["sourceVariable"], widgets: { sourceVariable: "variable" } },
  inputs: [inputPort],
  ui: { ...baseEntry.ui, label: "Gekoppelde taak", order: 3 },
};

function node(id: string, blockType: string, configuration: unknown = {}): WorkflowEditorNode {
  return { id, nodeKey: id, blockType, contractVersion: 1, label: blockType, description: blockType, configuration, position: { x: 0, y: 0 } };
}

describe("workflow editor validation and quick fixes", () => {
  it("adds and connects an explicit end node for an open path", () => {
    const graph = { nodes: [node("start", "manual_start")], edges: [] };
    const validation = validateWorkflowEditorDraft(graph.nodes, graph.edges, [baseEntry, endEntry]);
    const fix = validation.blockers.find((issue) => issue.code === "end_missing")?.quickFix;
    expect(fix).toEqual({ kind: "add_end_nodes" });

    const fixed = applyWorkflowEditorQuickFix(graph, fix!, [baseEntry, endEntry], () => "end-id");
    expect(fixed.nodes).toHaveLength(2);
    expect(fixed.nodes[1]).toMatchObject({ id: "end-id", blockType: "end" });
    expect(fixed.edges[0]).toMatchObject({ sourceNodeId: "start", targetNodeId: "end-id" });
    expect(validateWorkflowEditorDraft(fixed.nodes, fixed.edges, [baseEntry, endEntry]).blockers).toHaveLength(0);
  });

  it("offers a mapping quick fix only when the source is unambiguous", () => {
    const form = node("form", "form", { fields: [{ id: "klantcode", label: "Klant", type: "text" }] });
    const task = node("task", "mapped_task");
    const validation = validateWorkflowEditorDraft([form, task], [], [mappingEntry]);
    const mappingIssue = validation.blockers.find((issue) => issue.property === "sourceVariable");
    expect(mappingIssue?.quickFix).toEqual({ kind: "assign_variable", nodeId: "task", property: "sourceVariable", value: "klantcode" });

    const fixed = applyWorkflowEditorQuickFix({ nodes: [form, task], edges: [] }, mappingIssue!.quickFix!, [mappingEntry], () => "unused");
    expect(fixed.nodes.find((item) => item.id === "task")?.configuration).toEqual({ sourceVariable: "klantcode" });

    const secondForm = node("form-2", "form", { fields: [{ id: "portefeuille", label: "Portefeuille", type: "text" }] });
    const ambiguous = validateWorkflowEditorDraft([form, secondForm, task], [], [mappingEntry]);
    expect(ambiguous.blockers.find((issue) => issue.property === "sourceVariable")?.quickFix).toBeUndefined();
  });
});
