import { describe, expect, it } from "vitest";

import type { IdentityContext } from "@/lib/identity/types";
import {
  WorkflowRuntimeRecoveryService,
  type InsertNodeAttemptResult,
  type InsertWorkflowInstance,
  type InsertWorkflowNodeAttempt,
  type InsertWorkflowTask,
  type WorkflowEngineEvent,
  type WorkflowRuntimeChangeIntentApplyUpdate,
  type WorkflowRuntimeChangeIntentRecord,
  type WorkflowRuntimeChangeIntentWrite,
  type WorkflowRuntimeChangeIntentWriteResult,
  type WorkflowRuntimeEdgeDefinition,
  type WorkflowRuntimeGraph,
  type WorkflowRuntimeInstanceRecord,
  type WorkflowRuntimeNodeRecord,
  type WorkflowRuntimeOutboxWriteResult,
  type WorkflowRuntimeRoleBindingRecord,
  type WorkflowRuntimeSnapshotRecord,
  type WorkflowRuntimeSnapshotWrite,
  type WorkflowRuntimeSnapshotWriteResult,
  type WorkflowRuntimeStore,
  type WorkflowRuntimeTransaction,
  type WorkflowTaskMutation,
  type WorkflowTaskRecord,
  type WorkflowTaskStatus,
  type WorkflowVariableRecord,
  type WorkflowVariableWrite,
  type WorkflowVariableWriteResult,
} from "@/lib/workflow-studio";
import type { WorkflowOutboxEnqueueInput } from "@/lib/workflow-studio/runtime-outbox";

function clone<T>(value: T): T {
  return structuredClone(value);
}

const occurredAt = "2026-08-11T10:00:00.000Z";

const identity = (overrides: Partial<IdentityContext> = {}): IdentityContext => ({
  userId: "manager-1",
  displayName: "Manager",
  groups: ["bcm:role:change_manager"],
  tenant: "tenant-a",
  businessUnit: "bu-a",
  sessionId: "session-1",
  ...overrides,
});

function instance(overrides: Partial<WorkflowRuntimeInstanceRecord> = {}): WorkflowRuntimeInstanceRecord {
  return {
    kind: "instance",
    instanceId: "instance-1",
    workflowVersionId: "version-1",
    tenant: "tenant-a",
    businessUnit: "bu-a",
    clientIds: null,
    status: "running",
    idempotencyKey: "start",
    correlationId: "correlation-1",
    startedByUserId: "user-1",
    input: {},
    startedAt: "2026-08-11T09:00:00.000Z",
    ...overrides,
  };
}

function node(overrides: Partial<WorkflowRuntimeNodeRecord> = {}): WorkflowRuntimeNodeRecord {
  return {
    kind: "node",
    instanceId: "instance-1",
    nodeInstanceId: "node-1",
    workflowVersionId: "version-1",
    workflowNodeId: "workflow-node-1",
    nodeKey: "integrate",
    blockType: "integration",
    executionKind: "automated",
    status: "needs_intervention",
    attempt: 1,
    maxAttempts: 3,
    input: {},
    idempotencyKey: "node",
    correlationId: "correlation-1",
    availableAt: "2026-08-11T09:00:00.000Z",
    ...overrides,
  };
}

class RecoveryMemoryStore implements WorkflowRuntimeStore, WorkflowRuntimeTransaction {
  instances = new Map([["instance-1", instance()]]);
  nodes = new Map([["node-1", node()]]);
  events: WorkflowEngineEvent[] = [];

  async transaction<T>(work: (transaction: WorkflowRuntimeTransaction) => Promise<T>): Promise<T> {
    const snapshot = { instances: clone([...this.instances]), nodes: clone([...this.nodes]), events: clone(this.events) };
    try {
      return await work(this);
    } catch (error) {
      this.instances = new Map(snapshot.instances);
      this.nodes = new Map(snapshot.nodes);
      this.events = snapshot.events;
      throw error;
    }
  }

  async findInstanceByStartKey(): Promise<WorkflowRuntimeInstanceRecord | null> { throw new Error("not used"); }
  async loadPublishedGraph(): Promise<WorkflowRuntimeGraph | null> { throw new Error("not used"); }
  async insertInstance(_input: InsertWorkflowInstance): Promise<WorkflowRuntimeInstanceRecord | null> { throw new Error("not used"); }
  async lockInstance(instanceId: string) { return clone(this.instances.get(instanceId) ?? null); }
  async updateInstance(state: WorkflowRuntimeInstanceRecord) { this.instances.set(state.instanceId, clone(state)); }
  async loadNode(nodeInstanceId: string) { return clone(this.nodes.get(nodeInstanceId) ?? null); }
  async updateNode(state: WorkflowRuntimeNodeRecord) { this.nodes.set(state.nodeInstanceId, clone(state)); }
  async insertNodeAttempt(input: InsertWorkflowNodeAttempt): Promise<InsertNodeAttemptResult> {
    const created: WorkflowRuntimeNodeRecord = {
      kind: "node",
      instanceId: input.instanceId,
      nodeInstanceId: input.nodeInstanceId,
      workflowVersionId: input.workflowVersionId,
      workflowNodeId: input.workflowNodeId,
      nodeKey: input.nodeKey,
      blockType: input.blockType,
      executionKind: input.executionKind,
      status: input.status ?? "ready",
      attempt: 2,
      maxAttempts: input.maxAttempts,
      input: input.input,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      availableAt: input.availableAt,
      ...(input.causationId ? { causationId: input.causationId } : {}),
    };
    this.nodes.set(created.nodeInstanceId, clone(created));
    return { node: clone(created), created: true };
  }
  async findCommandEvent(instanceId: string, idempotencyKey: string) {
    return clone(this.events.find((event) => event.instanceId === instanceId && event.idempotencyKey === idempotencyKey) ?? null);
  }
  async appendEvent(event: WorkflowEngineEvent) {
    const existing = await this.findCommandEvent(event.instanceId, event.idempotencyKey);
    if (existing) return existing;
    const stored = { ...clone(event), id: `event-${this.events.length + 1}`, sequenceNumber: this.events.length + 1 };
    this.events.push(stored);
    return clone(stored);
  }
  async listEvents(instanceId: string) { return clone(this.events.filter((event) => event.instanceId === instanceId)); }
  async listOutgoingEdges(): Promise<readonly WorkflowRuntimeEdgeDefinition[]> { return []; }
  async listIncomingEdges(): Promise<readonly WorkflowRuntimeEdgeDefinition[]> { return []; }
  async findRunnableNode(): Promise<WorkflowRuntimeNodeRecord | null> { return null; }
  async listNodes(instanceId: string) { return clone([...this.nodes.values()].filter((item) => item.instanceId === instanceId)); }
  async listVariables(): Promise<readonly WorkflowVariableRecord[]> { return []; }
  async writeVariable(_input: WorkflowVariableWrite): Promise<WorkflowVariableWriteResult> { throw new Error("not used"); }
  async loadDataSnapshot(): Promise<WorkflowRuntimeSnapshotRecord | null> { throw new Error("not used"); }
  async writeDataSnapshot(_input: WorkflowRuntimeSnapshotWrite): Promise<WorkflowRuntimeSnapshotWriteResult> { throw new Error("not used"); }
  async writeChangeIntent(_input: WorkflowRuntimeChangeIntentWrite): Promise<WorkflowRuntimeChangeIntentWriteResult> { throw new Error("not used"); }
  async loadChangeIntent(): Promise<WorkflowRuntimeChangeIntentRecord | null> { throw new Error("not used"); }
  async updateChangeIntentApplyResult(_input: WorkflowRuntimeChangeIntentApplyUpdate): Promise<WorkflowRuntimeChangeIntentRecord> { throw new Error("not used"); }
  async enqueueOutbox(_input: WorkflowOutboxEnqueueInput): Promise<WorkflowRuntimeOutboxWriteResult> { throw new Error("not used"); }
  async findRoleBinding(): Promise<WorkflowRuntimeRoleBindingRecord | null> { throw new Error("not used"); }
  async writeTask(_input: InsertWorkflowTask): Promise<{ task: WorkflowTaskRecord; created: boolean }> { throw new Error("not used"); }
  async loadTask(): Promise<WorkflowTaskRecord | null> { throw new Error("not used"); }
  async updateTask(_input: WorkflowTaskMutation): Promise<WorkflowTaskRecord> { throw new Error("not used"); }
  async listTasksForGroups(_identityGroups: readonly string[], _statuses?: readonly WorkflowTaskStatus[]): Promise<readonly WorkflowTaskRecord[]> { throw new Error("not used"); }
  async listOverdueTasks(): Promise<readonly WorkflowTaskRecord[]> { throw new Error("not used"); }
}

describe("workflow runtime recovery", () => {
  it("schedules an authorized manual retry and records an incident note", async () => {
    const store = new RecoveryMemoryStore();
    store.nodes.set("node-1", node({
      status: "failed",
      startedAt: "2026-08-11T09:01:00.000Z",
      errorClass: "permanent_technical",
      errorCode: "connector_failed",
      errorMessage: "Connector faalde.",
    }));
    const result = await new WorkflowRuntimeRecoveryService(store).manualRetry(identity(), {
      instanceId: "instance-1",
      nodeInstanceId: "node-1",
      commandId: "retry-1",
      correlationId: "correlation-1",
      occurredAt,
      incidentNote: "Connector hersteld; opnieuw proberen.",
    });

    expect(result).toMatchObject({ ok: true });
    expect([...store.nodes.values()].some((item) => item.status === "ready" && item.attempt === 2)).toBe(true);
    expect(store.events.map((event) => event.eventType)).toEqual([
      "workflow.node.retry_scheduled",
      "workflow.recovery.action_recorded",
    ]);
    expect(store.events.at(-1)?.payload).toMatchObject({ action: "manual_retry", incidentNote: "Connector hersteld; opnieuw proberen." });
  });

  it("skips a ready node with an auditable recovery decision", async () => {
    const store = new RecoveryMemoryStore();
    store.nodes.set("node-1", node({ status: "ready" }));

    const result = await new WorkflowRuntimeRecoveryService(store).skipNode(identity(), {
      instanceId: "instance-1",
      nodeInstanceId: "node-1",
      commandId: "skip-1",
      correlationId: "correlation-1",
      occurredAt,
      incidentNote: "Externe stap handmatig afgerond.",
    });

    expect(result).toMatchObject({ ok: true });
    expect(store.nodes.get("node-1")).toMatchObject({ status: "skipped" });
    expect(store.events.map((event) => event.eventType)).toEqual(["workflow.node.skipped", "workflow.recovery.action_recorded"]);
  });

  it("deduplicates repeated recovery commands and recovery audit events", async () => {
    const store = new RecoveryMemoryStore();
    store.nodes.set("node-1", node({ status: "ready" }));
    const service = new WorkflowRuntimeRecoveryService(store);
    const command = {
      instanceId: "instance-1",
      nodeInstanceId: "node-1",
      commandId: "skip-1",
      correlationId: "correlation-1",
      occurredAt,
      incidentNote: "Externe stap handmatig afgerond.",
    };

    const first = await service.skipNode(identity(), command);
    const second = await service.skipNode(identity(), command);

    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({ ok: true, value: { deduplicated: true }, recoveryEvent: null });
    expect(store.events.map((event) => event.eventType)).toEqual(["workflow.node.skipped", "workflow.recovery.action_recorded"]);
  });

  it("terminates a waiting instance with a recovery audit event", async () => {
    const store = new RecoveryMemoryStore();
    store.instances.set("instance-1", instance({ status: "waiting" }));
    const result = await new WorkflowRuntimeRecoveryService(store).terminateInstance(identity(), {
      instanceId: "instance-1",
      commandId: "terminate-1",
      correlationId: "correlation-1",
      occurredAt,
      incidentNote: "Wachtende workflow beëindigd na incidentreview.",
    });

    expect(result).toMatchObject({ ok: true });
    expect(store.instances.get("instance-1")).toMatchObject({ status: "cancelled" });
    expect(store.events.map((event) => event.eventType)).toEqual(["workflow.instance.cancelled", "workflow.recovery.action_recorded"]);
  });

  it("terminates a running instance with a recovery audit event", async () => {
    const store = new RecoveryMemoryStore();
    const result = await new WorkflowRuntimeRecoveryService(store).terminateInstance(identity(), {
      instanceId: "instance-1",
      commandId: "terminate-1",
      correlationId: "correlation-1",
      occurredAt,
      incidentNote: "Incident gesloten; workflow beëindigd.",
    });

    expect(result).toMatchObject({ ok: true });
    expect(store.instances.get("instance-1")).toMatchObject({ status: "cancelled" });
    expect(store.events.map((event) => event.eventType)).toEqual(["workflow.instance.cancelled", "workflow.recovery.action_recorded"]);
  });

  it("records compensation only for allowlisted block handlers", async () => {
    const store = new RecoveryMemoryStore();
    const service = new WorkflowRuntimeRecoveryService(store);

    await expect(service.planCompensation({ nodeInstanceId: "node-1" })).resolves.toMatchObject({
      compensatable: true,
      handlerId: "workflow.integration.compensate.v1",
    });
    const result = await service.recordCompensation(identity(), {
      instanceId: "instance-1",
      nodeInstanceId: "node-1",
      commandId: "compensate-1",
      correlationId: "correlation-1",
      occurredAt,
      incidentNote: "Connectoractie handmatig teruggedraaid.",
    });

    expect(result).toMatchObject({ ok: true });
    expect(store.events).toEqual([expect.objectContaining({
      eventType: "workflow.recovery.action_recorded",
      payload: expect.objectContaining({ action: "compensate_node", details: expect.objectContaining({ compensation: expect.objectContaining({ handlerId: "workflow.integration.compensate.v1" }) }) }),
    })]);
  });

  it("denies recovery to users without workflow manage permission", async () => {
    const store = new RecoveryMemoryStore();
    const result = await new WorkflowRuntimeRecoveryService(store).manualRetry(identity({ groups: ["bcm:role:account_manager"] }), {
      instanceId: "instance-1",
      nodeInstanceId: "node-1",
      commandId: "retry-1",
      correlationId: "correlation-1",
      occurredAt,
      incidentNote: "Niet toegestaan.",
    });

    expect(result).toMatchObject({ ok: false, code: "permission_denied" });
    expect(store.events).toHaveLength(0);
  });
});
