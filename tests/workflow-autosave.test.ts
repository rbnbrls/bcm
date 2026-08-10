import { describe, expect, it } from "vitest";
import type { WorkflowEditorGraph } from "@/lib/workflow-studio/editor-model";
import {
  createWorkflowLocalDraftSnapshot,
  parseWorkflowLocalDraftSnapshot,
  toWorkflowAutosaveRequest,
  workflowGraphSignature,
  workflowLocalDraftStorageKey,
} from "@/lib/workflow-studio/workflow-autosave";

const definitionId = "11111111-1111-4111-8111-111111111111";
const graph: WorkflowEditorGraph = {
  nodes: [{
    id: "22222222-2222-4222-8222-222222222222",
    nodeKey: "start",
    blockType: "manual_start",
    contractVersion: 1,
    label: "Start",
    description: "Start",
    configuration: { label: "Start" },
    position: { x: 10, y: 20 },
  }],
  edges: [{
    id: "edge:local",
    edgeKey: "start_to_end",
    sourceNodeId: "22222222-2222-4222-8222-222222222222",
    sourcePort: "out",
    targetNodeId: "33333333-3333-4333-8333-333333333333",
    targetPort: "in",
  }],
};

describe("workflow autosave serialization", () => {
  it("serializes editor graphs for atomic optimistic-locking updates", () => {
    const request = toWorkflowAutosaveRequest(definitionId, "7", graph, [{
      workflowRole: "aanvrager",
      identityGroup: "bcm:requesters",
      permissions: ["workflow:start"],
      tenant: "tenant-a",
      businessUnit: "investments",
    }]);
    expect(request.expectedRevision).toBe(7);
    expect(request.nodes[0]).toMatchObject({ id: graph.nodes[0]?.id, block: { blockType: "manual_start", contractVersion: 1 } });
    expect(request.edges[0]?.id).toBeUndefined();
    expect(request.edges[0]?.condition).toBeNull();
    expect(request.roleBindings[0]?.permissions).toEqual(["workflow:start"]);
  });

  it("round-trips only matching, versioned local recovery snapshots", () => {
    const snapshot = createWorkflowLocalDraftSnapshot(definitionId, "7", graph, "2026-08-10T12:00:00.000Z");
    expect(parseWorkflowLocalDraftSnapshot(JSON.stringify(snapshot), definitionId)).toEqual(snapshot);
    expect(parseWorkflowLocalDraftSnapshot(JSON.stringify(snapshot), "99999999-9999-4999-8999-999999999999")).toBeNull();
    expect(parseWorkflowLocalDraftSnapshot("not-json", definitionId)).toBeNull();
    expect(workflowLocalDraftStorageKey(definitionId)).toContain(definitionId);
  });

  it("changes the draft signature for configuration and position edits", () => {
    const configured = structuredClone(graph);
    configured.nodes[0]!.configuration = { label: "Andere start" };
    expect(workflowGraphSignature(configured)).not.toBe(workflowGraphSignature(graph));
    configured.nodes[0]!.configuration = graph.nodes[0]!.configuration;
    configured.nodes[0]!.position.x = 99;
    expect(workflowGraphSignature(configured)).not.toBe(workflowGraphSignature(graph));
  });
});
