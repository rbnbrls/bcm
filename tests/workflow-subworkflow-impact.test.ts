import { describe, expect, it } from "vitest";

import {
  analyzeWorkflowSubworkflowImpact,
  collectWorkflowSubworkflowReferences,
  type WorkflowVersionSnapshot,
} from "@/lib/workflow-studio";

function snapshot(input: {
  slug: string;
  name: string;
  definitionId: string;
  versionId: string;
  versionNumber: number;
  childWorkflowVersionId: string;
  nodeKey: string;
}): WorkflowVersionSnapshot {
  return {
    definition: {
      id: input.definitionId,
      tenant: "tenant-a",
      businessUnit: "bu-a",
      clientIds: null,
      slug: input.slug,
      name: input.name,
      description: "",
      category: "change",
      tags: [],
      catalogDescription: "",
      costModel: { baseCost: 0, currency: "EUR", description: "" },
      ownerUserId: "owner-1",
      status: "published",
      createdAt: "2026-08-11T08:00:00.000Z",
      updatedAt: "2026-08-11T08:00:00.000Z",
    },
    version: {
      id: input.versionId,
      workflowDefinitionId: input.definitionId,
      versionNumber: input.versionNumber,
      schemaVersion: 1,
      status: "published",
      contentHash: "hash",
      revision: "1",
      publishedAt: "2026-08-11T08:00:00.000Z",
      publishedByUserId: "publisher-1",
      createdAt: "2026-08-11T08:00:00.000Z",
      updatedAt: "2026-08-11T08:00:00.000Z",
    },
    nodes: [{
      id: `${input.versionId}:node`,
      workflowVersionId: input.versionId,
      nodeKey: input.nodeKey,
      blockType: "subworkflow",
      blockContractVersion: 1,
      configuration: {
        label: "Risk gate",
        childWorkflowVersionId: input.childWorkflowVersionId,
        pinnedVersionLabel: "Risk gate v2",
        inputMappings: [{ parentVariable: "aanvraag", childVariable: "fragment_input" }],
        outputMappings: [{ parentVariable: "risk_resultaat", childVariable: "fragment_resultaat" }],
        nestingDepth: 1,
      },
      positionX: 0,
      positionY: 0,
    }],
    edges: [],
    roleBindings: [],
  };
}

describe("workflow subworkflow impact analysis", () => {
  it("collects parent workflows that reference a pinned child version", () => {
    const childWorkflowVersionId = "11111111-1111-4111-8111-111111111111";
    const snapshots = [
      snapshot({
        slug: "benchmark-switch",
        name: "Benchmark switch",
        definitionId: "definition-a",
        versionId: "version-a",
        versionNumber: 2,
        childWorkflowVersionId,
        nodeKey: "risk_gate",
      }),
      snapshot({
        slug: "client-onboarding",
        name: "Client onboarding",
        definitionId: "definition-b",
        versionId: "version-b",
        versionNumber: 5,
        childWorkflowVersionId,
        nodeKey: "risk_gate",
      }),
      snapshot({
        slug: "unrelated",
        name: "Unrelated",
        definitionId: "definition-c",
        versionId: "version-c",
        versionNumber: 1,
        childWorkflowVersionId: "22222222-2222-4222-8222-222222222222",
        nodeKey: "other_fragment",
      }),
    ];

    expect(collectWorkflowSubworkflowReferences(snapshots).map((reference) => reference.parentWorkflowSlug)).toEqual([
      "benchmark-switch",
      "client-onboarding",
      "unrelated",
    ]);
    expect(analyzeWorkflowSubworkflowImpact(childWorkflowVersionId, snapshots)).toMatchObject({
      childWorkflowVersionId,
      referenceCount: 2,
      references: [
        { parentWorkflowSlug: "benchmark-switch", parentVersionNumber: 2, nodeKey: "risk_gate", inputMappingCount: 1, outputMappingCount: 1 },
        { parentWorkflowSlug: "client-onboarding", parentVersionNumber: 5, nodeKey: "risk_gate", inputMappingCount: 1, outputMappingCount: 1 },
      ],
    });
  });
});
