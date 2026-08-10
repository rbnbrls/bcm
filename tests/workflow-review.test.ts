import { describe, expect, it } from "vitest";
import { createWorkflowReviewDiff } from "@/lib/workflow-studio/workflow-review";
import type { WorkflowVersionSnapshot } from "@/lib/workflow-studio/definition-repository";

function snapshot(versionNumber: number, configuration: Record<string, unknown> = {}): WorkflowVersionSnapshot {
  const versionId = `00000000-0000-4000-8000-00000000000${versionNumber}`;
  const startId = `10000000-0000-4000-8000-00000000000${versionNumber}`;
  return {
    version: {
      id: versionId, workflowDefinitionId: "20000000-0000-4000-8000-000000000001",
      versionNumber, schemaVersion: 1, status: versionNumber === 1 ? "published" : "draft",
      contentHash: versionNumber === 1 ? "a".repeat(64) : null, revision: "1",
      publishedAt: versionNumber === 1 ? "2026-08-10T00:00:00Z" : null,
      publishedByUserId: versionNumber === 1 ? "reviewer" : null,
      createdAt: "2026-08-10T00:00:00Z", updatedAt: "2026-08-10T00:00:00Z",
    },
    definition: {
      id: "20000000-0000-4000-8000-000000000001", tenant: "tenant-a", businessUnit: "bu",
      clientIds: null, slug: "flow", name: "Flow", description: "Beschrijving", category: "change",
      tags: [], catalogDescription: "Catalogus", costModel: { baseCost: 0, currency: "EUR", description: "" },
      ownerUserId: "maker", status: "draft", createdAt: "2026-08-10T00:00:00Z", updatedAt: "2026-08-10T00:00:00Z",
    },
    nodes: [{
      id: startId, workflowVersionId: versionId, nodeKey: "start", blockType: "manual_start",
      blockContractVersion: 1, configuration, positionX: 0, positionY: 0,
    }],
    edges: [], roleBindings: [],
  };
}

describe("createWorkflowReviewDiff", () => {
  it("vergelijkt inhoud op stabiele sleutels in plaats van database-id's", () => {
    const diff = createWorkflowReviewDiff(snapshot(2), snapshot(1));
    expect(diff.changes).toEqual([]);
    expect(diff.baselineVersionNumber).toBe(1);
  });

  it("rapporteert een configuratiewijziging reproduceerbaar", () => {
    const diff = createWorkflowReviewDiff(snapshot(2, { title: "Nieuw" }), snapshot(1));
    expect(diff.counts).toEqual({ added: 0, removed: 0, changed: 1 });
    expect(diff.changes[0]).toMatchObject({ area: "nodes", key: "start", kind: "changed" });
  });
});
