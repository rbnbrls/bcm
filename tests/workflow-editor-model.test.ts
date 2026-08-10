import { describe, expect, it } from "vitest";
import type { BlockCatalogEntry } from "@/lib/workflow-studio/block-registry";
import {
  autoLayoutWorkflowEditorGraph,
  canConnectWorkflowEditorPorts,
  commitWorkflowEditorGraph,
  connectWorkflowEditorPorts,
  createWorkflowEditorHistory,
  createWorkflowEditorNode,
  moveWorkflowEditorNode,
  redoWorkflowEditorGraph,
  removeWorkflowEditorEdge,
  removeWorkflowEditorNode,
  updateWorkflowEditorNodeConfiguration,
  undoWorkflowEditorGraph,
  validateWorkflowEditorShell,
  type WorkflowEditorNode,
} from "@/lib/workflow-studio/editor-model";

const formEntry: BlockCatalogEntry = {
  blockType: "form",
  contractVersion: 1,
  configurationSchema: {},
  configurationUiSchema: { fieldOrder: [], widgets: {} },
  inputs: [{ id: "in", label: "In", valueType: "flow", required: true, maxConnections: 1 }],
  outputs: [{ id: "out", label: "Uit", valueType: "flow", required: true, maxConnections: 1 }],
  capabilities: [],
  ui: { label: "Formulier", description: "Formulier", category: "interaction", icon: "form", order: 30 },
};

const start: WorkflowEditorNode = {
  id: "start",
  nodeKey: "start",
  blockType: "manual_start",
  contractVersion: 1,
  label: "Start",
  description: "Start",
  configuration: {},
  position: { x: 10, y: 10 },
};

const startEntry: BlockCatalogEntry = {
  ...formEntry,
  blockType: "manual_start",
  inputs: [],
  ui: { ...formEntry.ui, label: "Start" },
};

const endEntry: BlockCatalogEntry = {
  ...formEntry,
  blockType: "end",
  outputs: [],
  ui: { ...formEntry.ui, label: "Einde" },
};

describe("workflow editor model", () => {
  it("creates stable per-type node keys and default positions", () => {
    const first = createWorkflowEditorNode(formEntry, [start], "form-a");
    const second = createWorkflowEditorNode(formEntry, [start, first], "form-b");
    expect(first.nodeKey).toBe("form_1");
    expect(second.nodeKey).toBe("form_2");
    expect(first.configuration).toMatchObject({ title: "Nieuw formulier" });
    const afterGap = createWorkflowEditorNode(formEntry, [start, second], "form-c");
    expect(afterGap.nodeKey).toBe("form_1");
  });

  it("moves immutably and clamps positions to the canvas origin", () => {
    const moved = moveWorkflowEditorNode([start], "start", { x: -20, y: 42 });
    expect(moved[0].position).toEqual({ x: 0, y: 42 });
    expect(start.position).toEqual({ x: 10, y: 10 });
  });

  it("removes only the selected node", () => {
    const form = createWorkflowEditorNode(formEntry, [start], "form-a");
    expect(removeWorkflowEditorNode([start, form], "form-a")).toEqual([start]);
  });

  it("reports start, end and disconnected-node shell issues", () => {
    const form = createWorkflowEditorNode(formEntry, [], "form-a");
    const issues = validateWorkflowEditorShell([form], []);
    expect(issues.map((issue) => issue.code)).toEqual(["start_count", "end_missing", "path_without_end"]);

    const end = { ...start, id: "end", nodeKey: "end", blockType: "end", label: "Einde" };
    const disconnected = validateWorkflowEditorShell([start, end, form], [{
      id: "edge",
      edgeKey: "start_to_end",
      sourceNodeId: "start",
      sourcePort: "out",
      targetNodeId: "end",
      targetPort: "in",
    }]);
    expect(disconnected).toContainEqual(expect.objectContaining({ code: "disconnected_node", nodeId: "form-a" }));
  });

  it("updates control-block configuration immutably and follows its label", () => {
    const configured = updateWorkflowEditorNodeConfiguration([start], "start", {
      label: "Start door beheerder",
      starterRoleIds: ["change_manager"],
      dataScope: "requester_scope",
    });
    expect(configured[0]).toMatchObject({
      label: "Start door beheerder",
      configuration: {
        starterRoleIds: ["change_manager"],
        dataScope: "requester_scope",
      },
    });
    expect(start.label).toBe("Start");
  });

  it("connects compatible ports with a deterministic edge identity", () => {
    const end = { ...start, id: "end", nodeKey: "end", blockType: "end", label: "Einde" };
    const graph = { nodes: [start, end], edges: [] };
    const source = { nodeId: "start", portId: "out" };
    const target = { nodeId: "end", portId: "in" };

    expect(canConnectWorkflowEditorPorts([startEntry, endEntry], graph, source, target).compatible).toBe(true);
    const connected = connectWorkflowEditorPorts([startEntry, endEntry], graph, source, target);
    expect(connected?.edges[0]).toMatchObject({
      id: "edge:start:out:end:in",
      edgeKey: "start_out_to_end_in",
      sourcePort: "out",
      targetPort: "in",
    });
    expect(canConnectWorkflowEditorPorts([startEntry, endEntry], connected!, source, target)).toMatchObject({ compatible: false });
  });

  it("rejects incompatible port types and cardinality overflow", () => {
    const stringTarget: BlockCatalogEntry = {
      ...endEntry,
      inputs: [{ id: "in", label: "Tekst", valueType: "string", required: true, maxConnections: 1 }],
    };
    const end = { ...start, id: "end", nodeKey: "end", blockType: "end", label: "Einde" };
    expect(canConnectWorkflowEditorPorts([startEntry, stringTarget], { nodes: [start, end], edges: [] },
      { nodeId: "start", portId: "out" }, { nodeId: "end", portId: "in" })).toMatchObject({ compatible: false, reason: expect.stringContaining("niet compatibel") });
  });

  it("undoes and redoes every committed graph change", () => {
    const initial = createWorkflowEditorHistory({ nodes: [start], edges: [] });
    const form = createWorkflowEditorNode(formEntry, [start], "form-a");
    const changed = commitWorkflowEditorGraph(initial, { nodes: [start, form], edges: [] });
    const undone = undoWorkflowEditorGraph(changed);
    const redone = redoWorkflowEditorGraph(undone);

    expect(changed.present.nodes).toHaveLength(2);
    expect(undone.present.nodes).toEqual([start]);
    expect(redone.present.nodes).toEqual([start, form]);
  });

  it("auto-layout is deterministic and edge removal is immutable", () => {
    const form = { ...createWorkflowEditorNode(formEntry, [start], "form-a"), nodeKey: "form" };
    const end = { ...start, id: "end", nodeKey: "end", blockType: "end", label: "Einde" };
    const edges = [
      { id: "one", edgeKey: "start_form", sourceNodeId: "start", sourcePort: "out", targetNodeId: "form-a", targetPort: "in" },
      { id: "two", edgeKey: "form_end", sourceNodeId: "form-a", sourcePort: "out", targetNodeId: "end", targetPort: "in" },
    ];
    const graph = { nodes: [end, form, start], edges };
    const first = autoLayoutWorkflowEditorGraph(graph);
    const second = autoLayoutWorkflowEditorGraph(graph);
    expect(first).toEqual(second);
    expect(first.nodes.find((node) => node.id === "start")?.position.x).toBeLessThan(first.nodes.find((node) => node.id === "end")?.position.x ?? 0);
    expect(removeWorkflowEditorEdge(first, "one").edges.map((edge) => edge.id)).toEqual(["two"]);
    expect(first.edges).toHaveLength(2);
  });
});
