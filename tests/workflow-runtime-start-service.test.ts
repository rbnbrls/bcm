import { describe, expect, it, vi } from "vitest";

import type { IdentityContext } from "@/lib/identity/types";
import type { WorkflowVersionSnapshot } from "@/lib/workflow-studio/definition-repository";
import type { WorkflowRuntimeEngine } from "@/lib/workflow-studio/runtime-engine";
import { WorkflowRuntimeStartService } from "@/lib/workflow-studio/runtime-start-service";

const identity: IdentityContext = {
  userId: "user-1",
  displayName: "Change Manager",
  groups: ["bcm:role:change_manager", "bcm:client:client-a"],
  tenant: "tenant-a",
  businessUnit: "bu-a",
  sessionId: "session-1",
};

function snapshot(overrides: {
  definitionStatus?: WorkflowVersionSnapshot["definition"]["status"];
  versionStatus?: WorkflowVersionSnapshot["version"]["status"];
  starterRoleIds?: readonly string[];
  identityGroup?: string;
  clientIds?: string[] | null;
} = {}): WorkflowVersionSnapshot {
  return {
    definition: {
      id: "definition-1",
      tenant: "tenant-a",
      businessUnit: "bu-a",
      clientIds: overrides.clientIds === undefined ? ["client-a", "client-b"] : overrides.clientIds,
      slug: "runtime-flow",
      name: "Runtime flow",
      description: "Runtime workflow description",
      category: "change",
      tags: [],
      catalogDescription: "Start deze gepubliceerde workflow.",
      costModel: { baseCost: 100, currency: "EUR", description: "Vaste kosten" },
      ownerUserId: "owner",
      status: overrides.definitionStatus ?? "published",
      createdAt: "2026-08-11T08:00:00.000Z",
      updatedAt: "2026-08-11T08:00:00.000Z",
    },
    version: {
      id: "version-1",
      workflowDefinitionId: "definition-1",
      versionNumber: 3,
      schemaVersion: 1,
      status: overrides.versionStatus ?? "published",
      contentHash: "a".repeat(64),
      revision: "3",
      publishedAt: "2026-08-11T08:00:00.000Z",
      publishedByUserId: "publisher",
      createdAt: "2026-08-11T08:00:00.000Z",
      updatedAt: "2026-08-11T08:00:00.000Z",
    },
    nodes: [
      {
        id: "start-node",
        workflowVersionId: "version-1",
        nodeKey: "start",
        blockType: "manual_start",
        blockContractVersion: 1,
        configuration: overrides.starterRoleIds === undefined ? { label: "Start" } : { label: "Start", starterRoleIds: overrides.starterRoleIds },
        positionX: 0,
        positionY: 0,
      },
      {
        id: "form-node",
        workflowVersionId: "version-1",
        nodeKey: "application",
        blockType: "form",
        blockContractVersion: 1,
        configuration: { title: "Aanvraag", fields: [{ id: "amount", label: "Bedrag", type: "number", required: true }] },
        positionX: 100,
        positionY: 0,
      },
    ],
    edges: [],
    roleBindings: overrides.starterRoleIds === undefined ? [] : [{
      id: "binding-1",
      workflowVersionId: "version-1",
      workflowRole: overrides.starterRoleIds[0] ?? "starter",
      identityGroup: overrides.identityGroup ?? "bcm:role:change_manager",
      permissions: ["workflow:start"],
      tenant: "tenant-a",
      businessUnit: "bu-a",
      clientIds: ["client-a", "client-b"],
    }],
  };
}

function service(value: WorkflowVersionSnapshot | null, start = vi.fn()) {
  return {
    start,
    value: new WorkflowRuntimeStartService(
      { loadVersion: vi.fn().mockResolvedValue(value) },
      { start } as unknown as Pick<WorkflowRuntimeEngine, "start">,
    ),
  };
}

describe("workflow runtime start service", () => {
  it("prepares published forms and narrows the instance to the signed client scope", async () => {
    const result = await service(snapshot()).value.prepare(identity, "version-1");
    expect(result).toMatchObject({
      ok: true,
      value: {
        workflowVersionId: "version-1",
        versionNumber: 3,
        contentHash: "a".repeat(64),
        scope: { tenant: "tenant-a", businessUnit: "bu-a", clientIds: ["client-a"] },
        forms: [{ nodeKey: "application", configuration: { title: "Aanvraag" } }],
      },
    });
  });

  it.each([
    [snapshot({ versionStatus: "draft" }), "definition_not_startable"],
    [snapshot({ definitionStatus: "deprecated" }), "definition_not_startable"],
    [null, "version_not_found"],
  ])("refuses drafts, deprecated definitions and missing versions", async (value, code) => {
    expect(await service(value).value.prepare(identity, "version-1")).toMatchObject({ ok: false, code });
  });

  it("enforces workflow:start independently of route access", async () => {
    const unauthorized = { ...identity, groups: ["bcm:role:account_manager", "bcm:client:client-a"] };
    expect(await service(snapshot()).value.prepare(unauthorized, "version-1")).toMatchObject({ ok: false, code: "permission_denied" });
  });

  it("enforces explicit starter roles against immutable version bindings", async () => {
    expect(await service(snapshot({ starterRoleIds: ["requester"], identityGroup: "bcm:role:account_manager" })).value.prepare(identity, "version-1"))
      .toMatchObject({ ok: false, code: "starter_role_denied" });
    expect(await service(snapshot({ starterRoleIds: ["requester"] })).value.prepare(identity, "version-1"))
      .toMatchObject({ ok: true });
  });

  it("rejects workflows outside the signed tenant, businessunit or client scope", async () => {
    expect(await service(snapshot({ clientIds: ["client-b"] })).value.prepare(identity, "version-1"))
      .toMatchObject({ ok: false, code: "identity_scope_missing" });
    const wrongTenant = snapshot();
    wrongTenant.definition.tenant = "tenant-b";
    expect(await service(wrongTenant).value.prepare(identity, "version-1"))
      .toMatchObject({ ok: false, code: "scope_denied" });
  });

  it("re-authorizes and passes only pinned version, signed actor, narrowed scope and validated values to the engine", async () => {
    const start = vi.fn().mockResolvedValue({
      instance: { instanceId: "instance-1" },
      state: { kind: "instance", instanceId: "instance-1", status: "running" },
      activatedNodes: [], events: [], variables: [], deduplicated: false,
    });
    const runtime = service(snapshot(), start).value;
    const result = await runtime.start(identity, {
      workflowVersionId: "version-1",
      idempotencyKey: "request-1",
      correlationId: "correlation-1",
      values: { amount: 125 },
      variables: [{ name: "amount", dataType: "number", value: 125 }],
      occurredAt: "2026-08-11T09:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    expect(start).toHaveBeenCalledWith(expect.objectContaining({
      workflowVersionId: "version-1",
      idempotencyKey: "request-1",
      clientIds: ["client-a"],
      input: { amount: 125 },
      actor: { type: "user", id: "user-1", sessionId: "session-1" },
    }));
  });
});
