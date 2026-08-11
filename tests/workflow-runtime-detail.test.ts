import { describe, expect, it } from "vitest";

import type {
  WorkflowEngineEvent,
  WorkflowRuntimeChangeIntentRecord,
  WorkflowRuntimeInstanceRecord,
  WorkflowRuntimeNodeRecord,
  WorkflowRuntimeSnapshotRecord,
  WorkflowTaskRecord,
} from "@/lib/workflow-studio/runtime-engine";
import type { WorkflowOutboxMessage } from "@/lib/workflow-studio/runtime-outbox";
import { WorkflowRuntimeDetailService, type WorkflowRuntimeDetailReader } from "@/lib/workflow-studio/runtime-detail";

const instance: WorkflowRuntimeInstanceRecord = {
  kind: "instance",
  instanceId: "instance-1",
  workflowVersionId: "version-1",
  tenant: "tenant-a",
  businessUnit: "bu-a",
  clientIds: ["client-a"],
  status: "running",
  idempotencyKey: "start-1",
  correlationId: "correlation-1",
  startedByUserId: "starter-1",
  input: {},
  startedAt: "2026-08-11T08:00:00.000Z",
};

function node(overrides: Partial<WorkflowRuntimeNodeRecord>): WorkflowRuntimeNodeRecord {
  return {
    kind: "node",
    instanceId: "instance-1",
    nodeInstanceId: "node-1",
    workflowVersionId: "version-1",
    workflowNodeId: "workflow-node-1",
    nodeKey: "controle",
    blockType: "role_task",
    executionKind: "human",
    status: "running",
    attempt: 1,
    maxAttempts: 3,
    input: {},
    idempotencyKey: "node-1",
    correlationId: "correlation-1",
    availableAt: "2026-08-11T08:00:00.000Z",
    startedAt: "2026-08-11T08:01:00.000Z",
    ...overrides,
  };
}

class MemoryDetailReader implements WorkflowRuntimeDetailReader {
  constructor(readonly found = true) {}
  async loadInstance() { return this.found ? instance : null; }
  async listNodes() { return [node({}), node({ nodeInstanceId: "node-failed", status: "failed", attempt: 1, maxAttempts: 2, errorMessage: "Timeout." })]; }
  async listTasks(): Promise<readonly WorkflowTaskRecord[]> { return []; }
  async listSnapshots(): Promise<readonly WorkflowRuntimeSnapshotRecord[]> { return []; }
  async listChangeIntents(): Promise<readonly WorkflowRuntimeChangeIntentRecord[]> { return []; }
  async listEvents(): Promise<readonly WorkflowEngineEvent[]> {
    return [{
      id: "event-1",
      sequenceNumber: 1,
      instanceId: "instance-1",
      nodeInstanceId: "node-decision",
      eventType: "workflow.decision.evaluated",
      eventVersion: 1,
      payload: { matched: true, outputPort: "matched" },
      actor: { type: "system", id: "worker-1" },
      idempotencyKey: "decision-1",
      correlationId: "correlation-1",
      occurredAt: "2026-08-11T08:02:00.000Z",
    }];
  }
  async listOutbox(): Promise<readonly WorkflowOutboxMessage[]> { return []; }
}

describe("workflow runtime detail read model", () => {
  it("combines runtime records into a reconstructable support model", async () => {
    const model = await new WorkflowRuntimeDetailService(new MemoryDetailReader()).load("instance-1");

    expect(model).toMatchObject({
      instance: { instanceId: "instance-1" },
      activeNodes: [expect.objectContaining({ nodeInstanceId: "node-1", status: "running" })],
      retryableNodes: [expect.objectContaining({ nodeInstanceId: "node-failed", errorMessage: "Timeout." })],
      decisions: [expect.objectContaining({ eventType: "workflow.decision.evaluated", payload: { matched: true, outputPort: "matched" } })],
    });
  });

  it("returns null for unknown instances", async () => {
    await expect(new WorkflowRuntimeDetailService(new MemoryDetailReader(false)).load("missing")).resolves.toBeNull();
  });
});
