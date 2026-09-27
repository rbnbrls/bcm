import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { IdentityContext } from "@/lib/identity/types";
import type { WorkflowDefinitionService } from "@/lib/workflow-studio/definition-service";
import { loadWorkflowOverview } from "@/lib/workflow-studio/overview";

const identity: IdentityContext = {
  userId: "manager-1",
  displayName: "Change Manager",
  groups: ["bcm:role:change_manager"],
  tenant: "tenant-a",
  businessUnit: "investments",
  sessionId: "session-1",
};

function definition() {
  return {
    id: randomUUID(),
    tenant: "tenant-a",
    businessUnit: "investments",
    clientIds: null,
    slug: "flow",
    name: "Flow",
    description: "Doel",
    ownerUserId: "manager-1",
    status: "published" as const,
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T01:00:00.000Z",
  };
}

describe("Workflow Studio overview loader", () => {
  it("loads lifecycle versions for every visible definition", async () => {
    const row = definition();
    const published = {
      id: randomUUID(),
      workflowDefinitionId: row.id,
      versionNumber: 3,
      schemaVersion: 1,
      status: "published" as const,
      contentHash: "a".repeat(64),
      revision: "3",
      publishedAt: row.updatedAt,
      publishedByUserId: "manager-1",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
    const service = {
      listForScope: vi.fn().mockResolvedValue({ ok: true, code: "ok", value: [row] }),
      load: vi.fn().mockResolvedValue({
        ok: true,
        code: "ok",
        value: { definition: row, draft: null, published, nodes: [], edges: [], roleBindings: [] },
      }),
    } as unknown as WorkflowDefinitionService;

    const result = await loadWorkflowOverview(service, identity);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]).toMatchObject({ definition: row, draft: null, published });
    expect(service.load).toHaveBeenCalledWith(identity, { definitionId: row.id, includeDraft: true });
  });

  it("does not query definitions without a signed tenant scope", async () => {
    const service = { listForScope: vi.fn() } as unknown as WorkflowDefinitionService;
    const result = await loadWorkflowOverview(service, { ...identity, businessUnit: null });
    expect(result).toMatchObject({ ok: false, code: "identity_scope_missing" });
    expect(service.listForScope).not.toHaveBeenCalled();
  });
});
