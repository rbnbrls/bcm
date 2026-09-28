import { describe, expect, it } from "vitest";

import {
  analyzeWorkflowVersionImpact,
  prepareWorkflowRollbackDraft,
  type WorkflowVersionSnapshot,
} from "@/lib/workflow-studio";

function snapshot(input: {
  versionId: string;
  versionNumber: number;
  nodes: WorkflowVersionSnapshot["nodes"];
  roleBindings?: WorkflowVersionSnapshot["roleBindings"];
}): WorkflowVersionSnapshot {
  return {
    version: {
      id: input.versionId,
      workflowDefinitionId: "definition-1",
      versionNumber: input.versionNumber,
      schemaVersion: 1,
      status: input.versionNumber === 1 ? "published" : "draft",
      contentHash: input.versionNumber === 1 ? "hash" : null,
      revision: "1",
      publishedAt: input.versionNumber === 1 ? "2026-08-11T08:00:00.000Z" : null,
      publishedByUserId: input.versionNumber === 1 ? "publisher-1" : null,
      createdAt: "2026-08-11T08:00:00.000Z",
      updatedAt: "2026-08-11T08:00:00.000Z",
    },
    definition: {
      id: "definition-1",
      tenant: "tenant-a",
      businessUnit: "bu-a",
      clientIds: ["client-a"],
      slug: "flow",
      name: "Flow",
      description: "Beschrijving",
      category: "change",
      tags: ["governed"],
      catalogDescription: "Catalogus",
      costModel: { baseCost: 10, currency: "EUR", description: "Kosten" },
      ownerUserId: "owner-1",
      status: "published",
      createdAt: "2026-08-11T08:00:00.000Z",
      updatedAt: "2026-08-11T08:00:00.000Z",
    },
    nodes: input.nodes,
    edges: [{
      id: `${input.versionId}:edge`,
      workflowVersionId: input.versionId,
      edgeKey: "start_end",
      sourceNodeId: `${input.versionId}:start`,
      sourcePort: "out",
      targetNodeId: `${input.versionId}:end`,
      targetPort: "in",
      condition: null,
    }],
    roleBindings: input.roleBindings ?? [],
  };
}

function node(versionId: string, nodeKey: string, blockType: string, configuration: Record<string, unknown> = {}): WorkflowVersionSnapshot["nodes"][number] {
  return {
    id: `${versionId}:${nodeKey}`,
    workflowVersionId: versionId,
    nodeKey,
    blockType,
    blockContractVersion: 1,
    configuration,
    positionX: 0,
    positionY: 0,
  };
}

describe("workflow version governance", () => {
  it("marks risky semantic changes in version diffs", () => {
    const baseline = snapshot({
      versionId: "11111111-1111-4111-8111-111111111111",
      versionNumber: 1,
      nodes: [
        node("11111111-1111-4111-8111-111111111111", "start", "manual_start"),
        node("11111111-1111-4111-8111-111111111111", "approval_a", "approval"),
        node("11111111-1111-4111-8111-111111111111", "approval_b", "approval"),
        node("11111111-1111-4111-8111-111111111111", "apply", "change_request"),
        node("11111111-1111-4111-8111-111111111111", "end", "end"),
      ],
      roleBindings: [{
        id: "binding-1",
        workflowVersionId: "11111111-1111-4111-8111-111111111111",
        workflowRole: "checker",
        identityGroup: "bcm:role:account_manager",
        permissions: ["workflow:approve"],
        tenant: "tenant-a",
        businessUnit: "bu-a",
        clientIds: ["client-a"],
      }],
    });
    const current = snapshot({
      versionId: "22222222-2222-4222-8222-222222222222",
      versionNumber: 2,
      nodes: [
        node("22222222-2222-4222-8222-222222222222", "start", "manual_start"),
        node("22222222-2222-4222-8222-222222222222", "approval_a", "approval"),
        node("22222222-2222-4222-8222-222222222222", "notify", "integration", {
          connectorId: "slack.post_message.v1",
          operation: "post_message",
          sandboxMode: false,
        }),
        node("22222222-2222-4222-8222-222222222222", "end", "end"),
      ],
      roleBindings: [{
        id: "binding-2",
        workflowVersionId: "22222222-2222-4222-8222-222222222222",
        workflowRole: "checker",
        identityGroup: "bcm:role:account_manager",
        permissions: ["workflow:approve"],
        tenant: "tenant-a",
        businessUnit: "bu-a",
        clientIds: null,
      }],
    });

    const analysis = analyzeWorkflowVersionImpact({
      current,
      baseline,
      activeInstances: [{ workflowVersionId: baseline.version.id, activeInstanceCount: 3 }],
    });

    expect(analysis.diff.counts.removed).toBeGreaterThan(0);
    expect(analysis.risks.map((risk) => risk.code)).toEqual(expect.arrayContaining([
      "approval_count_reduced",
      "data_scope_broadened",
      "change_intent_surface_changed",
      "integration_review_required",
      "active_instances_on_changed_version",
    ]));
    expect(analysis.risks.find((risk) => risk.code === "approval_count_reduced")).toMatchObject({ severity: "high" });
    expect(analysis.dependencies.integrationConnectors).toEqual([
      { nodeKey: "notify", connectorId: "slack.post_message.v1", connectorVersion: 1, operation: "post_message", sandboxMode: false },
    ]);
  });

  it("includes subworkflow dependency references for baseline and current versions", () => {
    const child = snapshot({
      versionId: "11111111-1111-4111-8111-111111111111",
      versionNumber: 1,
      nodes: [node("11111111-1111-4111-8111-111111111111", "start", "manual_start")],
    });
    const parent = snapshot({
      versionId: "33333333-3333-4333-8333-333333333333",
      versionNumber: 4,
      nodes: [node("33333333-3333-4333-8333-333333333333", "fragment", "subworkflow", {
        label: "Fragment",
        childWorkflowVersionId: child.version.id,
        inputMappings: [],
        outputMappings: [],
        nestingDepth: 1,
      })],
    });

    const analysis = analyzeWorkflowVersionImpact({ current: child, baseline: null, allSnapshots: [child, parent] });

    expect(analysis.dependencies.subworkflowReferences).toEqual([
      expect.objectContaining({ parentWorkflowVersionId: parent.version.id, childWorkflowVersionId: child.version.id, nodeKey: "fragment" }),
    ]);
  });

  it("prepares a rollback draft from an immutable previous version", () => {
    const previous = snapshot({
      versionId: "11111111-1111-4111-8111-111111111111",
      versionNumber: 1,
      nodes: [
        node("11111111-1111-4111-8111-111111111111", "start", "manual_start"),
        node("11111111-1111-4111-8111-111111111111", "end", "end"),
      ],
    });

    const draft = prepareWorkflowRollbackDraft(previous, { slug: "flow_rollback" });

    expect(draft).toMatchObject({
      slug: "flow_rollback",
      name: "Flow rollback v1",
      tags: expect.arrayContaining(["governed", "rollback", `rollback-source:${previous.version.id}`]),
      nodes: [
        expect.objectContaining({ nodeKey: "start", block: { blockType: "manual_start", contractVersion: 1 } }),
        expect.objectContaining({ nodeKey: "end", block: { blockType: "end", contractVersion: 1 } }),
      ],
    });
    expect(draft.scope).toEqual({ tenant: "tenant-a", businessUnit: "bu-a", clientIds: ["client-a"] });
  });
});
