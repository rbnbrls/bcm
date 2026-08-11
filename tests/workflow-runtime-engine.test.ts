import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  WorkflowRuntimeEngine,
  WorkflowRuntimeEngineError,
  type InsertNodeAttemptResult,
  type InsertWorkflowInstance,
  type InsertWorkflowNodeAttempt,
  type WorkflowEngineEvent,
  type WorkflowRuntimeEdgeDefinition,
  type WorkflowRuntimeChangeIntentApplyUpdate,
  type WorkflowRuntimeChangeIntentRecord,
  type WorkflowRuntimeChangeIntentWrite,
  type WorkflowRuntimeGraph,
  type WorkflowRuntimeInstanceRecord,
  type WorkflowRuntimeNodeDefinition,
  type WorkflowRuntimeNodeRecord,
  type WorkflowRuntimeRoleBindingRecord,
  type WorkflowRuntimeSnapshotRecord,
  type WorkflowRuntimeSnapshotWrite,
  type WorkflowRuntimeSnapshotWriteResult,
  type WorkflowRuntimeOutboxWriteResult,
  type WorkflowRuntimeStore,
  type WorkflowRuntimeTransaction,
  type WorkflowTaskMutation,
  type WorkflowTaskRecord,
  type WorkflowTaskStatus,
} from "@/lib/workflow-studio/runtime-engine";
import type { ClientConfigReadRecord } from "@/lib/workflow-studio/read-adapters";
import type { WorkflowOutboxEnqueueInput, WorkflowOutboxMessage } from "@/lib/workflow-studio/runtime-outbox";
import type { WorkflowRuntimeCommand } from "@/lib/workflow-studio/runtime-state-machine";
import type { MutationDryRunResult, MutationExecutionResult } from "@/lib/workflow-studio/mutation-adapters";
import {
  WorkflowVariableRuntimeError,
  type WorkflowVariableRecord,
  type WorkflowVariableWrite,
} from "@/lib/workflow-studio/runtime-variables";

const graph: WorkflowRuntimeGraph = {
  workflowVersionId: "version-1",
  definitionStatus: "published",
  tenant: "tenant-a",
  businessUnit: "bu-a",
  clientIds: ["client-a", "client-b"],
  nodes: [
    { id: "node-start", workflowVersionId: "version-1", nodeKey: "start", blockType: "manual_start", configuration: {} },
    { id: "node-task", workflowVersionId: "version-1", nodeKey: "task", blockType: "role_task", configuration: {} },
    { id: "node-end", workflowVersionId: "version-1", nodeKey: "end", blockType: "end", configuration: { outcome: "completed" } },
  ],
  edges: [
    { id: "edge-start-task", workflowVersionId: "version-1", edgeKey: "start_task", sourceNodeId: "node-start", sourcePort: "out", targetNodeId: "node-task", targetPort: "in", condition: null },
    { id: "edge-task-end", workflowVersionId: "version-1", edgeKey: "task_end", sourceNodeId: "node-task", sourcePort: "out", targetNodeId: "node-end", targetPort: "in", condition: null },
  ],
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

class MemoryRuntimeStore implements WorkflowRuntimeStore, WorkflowRuntimeTransaction {
  graph: WorkflowRuntimeGraph | null;
  instances = new Map<string, WorkflowRuntimeInstanceRecord>();
  nodes = new Map<string, WorkflowRuntimeNodeRecord>();
  variables = new Map<string, WorkflowVariableRecord>();
  snapshots = new Map<string, WorkflowRuntimeSnapshotRecord>();
  intents = new Map<string, WorkflowRuntimeChangeIntentRecord>();
  tasks = new Map<string, WorkflowTaskRecord>();
  roleBindings = new Map<string, WorkflowRuntimeRoleBindingRecord>();
  outbox = new Map<string, WorkflowOutboxMessage>();
  events: WorkflowEngineEvent[] = [];
  transactionCount = 0;

  constructor(value: WorkflowRuntimeGraph | null = graph) {
    this.graph = value;
  }

  async transaction<T>(work: (transaction: WorkflowRuntimeTransaction) => Promise<T>): Promise<T> {
    this.transactionCount += 1;
    const snapshot = {
      instances: clone([...this.instances]),
      nodes: clone([...this.nodes]),
      variables: clone([...this.variables]),
      snapshots: clone([...this.snapshots]),
      intents: clone([...this.intents]),
      tasks: clone([...this.tasks]),
      roleBindings: clone([...this.roleBindings]),
      outbox: clone([...this.outbox]),
      events: clone(this.events),
    };
    try {
      return await work(this);
    } catch (error) {
      this.instances = new Map(snapshot.instances);
      this.nodes = new Map(snapshot.nodes);
      this.variables = new Map(snapshot.variables);
      this.snapshots = new Map(snapshot.snapshots);
      this.intents = new Map(snapshot.intents);
      this.tasks = new Map(snapshot.tasks);
      this.roleBindings = new Map(snapshot.roleBindings);
      this.outbox = new Map(snapshot.outbox);
      this.events = snapshot.events;
      throw error;
    }
  }

  async findInstanceByStartKey(tenant: string, idempotencyKey: string) {
    return [...this.instances.values()].find((item) => item.tenant === tenant && item.idempotencyKey === idempotencyKey) ?? null;
  }

  async loadPublishedGraph(workflowVersionId: string) {
    return this.graph?.workflowVersionId === workflowVersionId ? clone(this.graph) : null;
  }

  async insertInstance(input: InsertWorkflowInstance) {
    if (await this.findInstanceByStartKey(input.tenant, input.idempotencyKey)) return null;
    const value: WorkflowRuntimeInstanceRecord = { ...clone(input), kind: "instance", status: "pending" };
    this.instances.set(value.instanceId, value);
    return clone(value);
  }

  async lockInstance(instanceId: string) {
    return clone(this.instances.get(instanceId) ?? null);
  }

  async updateInstance(state: WorkflowRuntimeInstanceRecord) {
    this.instances.set(state.instanceId, clone(state));
  }

  async loadNode(nodeInstanceId: string) {
    return clone(this.nodes.get(nodeInstanceId) ?? null);
  }

  async updateNode(state: WorkflowRuntimeNodeRecord) {
    this.nodes.set(state.nodeInstanceId, clone(state));
  }

  async insertNodeAttempt(input: InsertWorkflowNodeAttempt): Promise<InsertNodeAttemptResult> {
    const existing = [...this.nodes.values()].find((item) => (
      item.instanceId === input.instanceId && item.idempotencyKey === input.idempotencyKey
    ));
    if (existing) return { node: clone(existing), created: false };
    const attempt = [...this.nodes.values()].filter((item) => (
      item.instanceId === input.instanceId && item.workflowNodeId === input.workflowNodeId
    )).length + 1;
    const value: WorkflowRuntimeNodeRecord = {
      ...clone(input),
      kind: "node",
      status: "ready",
      attempt,
    };
    this.nodes.set(value.nodeInstanceId, value);
    return { node: clone(value), created: true };
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

  async listEvents(instanceId: string) {
    return clone(this.events.filter((event) => event.instanceId === instanceId));
  }

  async listOutgoingEdges(workflowVersionId: string, sourceNodeId: string, sourcePort: string) {
    return clone(this.graph?.edges.filter((edge) => (
      edge.workflowVersionId === workflowVersionId && edge.sourceNodeId === sourceNodeId && edge.sourcePort === sourcePort
    )) ?? []);
  }

  async listIncomingEdges(workflowVersionId: string, targetNodeId: string, targetPort: string) {
    return clone(this.graph?.edges.filter((edge) => (
      edge.workflowVersionId === workflowVersionId && edge.targetNodeId === targetNodeId && edge.targetPort === targetPort
    )) ?? []);
  }

  async findRunnableNode(instanceId: string, availableAt: string) {
    return clone([...this.nodes.values()]
      .filter((node) => node.instanceId === instanceId && node.status === "ready" && node.availableAt <= availableAt)
      .sort((left, right) => left.availableAt.localeCompare(right.availableAt))[0] ?? null);
  }

  async listNodes(instanceId: string) {
    return clone([...this.nodes.values()].filter((node) => node.instanceId === instanceId));
  }

  async listVariables(instanceId: string) {
    return clone([...this.variables.values()].filter((variable) => variable.instanceId === instanceId));
  }

  async writeVariable(input: WorkflowVariableWrite) {
    const duplicate = [...this.variables.values()].find((variable) => (
      variable.instanceId === input.instanceId && variable.idempotencyKey === input.idempotencyKey
    ));
    if (duplicate) return { variable: clone(duplicate), created: false };
    const conflict = [...this.variables.values()].find((variable) => (
      variable.instanceId === input.instanceId && variable.name === input.assignment.name
    ));
    if (conflict) throw new WorkflowVariableRuntimeError([{
      code: "variable_conflict",
      variableName: input.assignment.name,
      nodeInstanceId: input.sourceNodeInstanceId,
      message: `Variabele ${input.assignment.name} bestaat al.`,
    }]);
    const variable: WorkflowVariableRecord = {
      id: input.id,
      instanceId: input.instanceId,
      ...(input.sourceNodeInstanceId ? { sourceNodeInstanceId: input.sourceNodeInstanceId } : {}),
      scope: input.sourceNodeInstanceId ? "node_output" : "instance",
      name: input.assignment.name,
      dataType: input.assignment.dataType,
      value: clone(input.assignment.value),
      classification: input.assignment.classification ?? "internal",
      revision: 1,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
    };
    this.variables.set(variable.id, variable);
    return { variable: clone(variable), created: true };
  }

  async writeDataSnapshot(input: WorkflowRuntimeSnapshotWrite): Promise<WorkflowRuntimeSnapshotWriteResult> {
    const duplicate = [...this.snapshots.values()].find((snapshot) => (
      snapshot.instanceId === input.instanceId && snapshot.idempotencyKey === input.idempotencyKey
    ));
    if (duplicate) return { snapshot: clone(duplicate), created: false };
    const snapshot: WorkflowRuntimeSnapshotRecord = {
      id: input.id,
      instanceId: input.instanceId,
      sourceNodeInstanceId: input.sourceNodeInstanceId,
      resourceId: input.snapshot.resourceId,
      sourceRecordId: input.snapshot.sourceRecordId,
      selectedFields: clone(input.snapshot.selectedFields),
      concurrencyToken: input.snapshot.concurrencyToken,
      snapshotVersion: input.snapshot.snapshotVersion,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      ...(input.causationId ? { causationId: input.causationId } : {}),
      readAt: input.snapshot.readAt,
    };
    this.snapshots.set(snapshot.id, snapshot);
    return { snapshot: clone(snapshot), created: true };
  }

  async loadDataSnapshot(instanceId: string, snapshotId: string) {
    return clone([...this.snapshots.values()].find((snapshot) => snapshot.instanceId === instanceId && snapshot.id === snapshotId) ?? null);
  }

  async writeChangeIntent(input: WorkflowRuntimeChangeIntentWrite) {
    const duplicate = [...this.intents.values()].find((intent) => (
      intent.instanceId === input.instanceId && intent.idempotencyKey === input.idempotencyKey
    ));
    if (duplicate) return { intent: clone(duplicate), created: false };
    const intent: WorkflowRuntimeChangeIntentRecord = {
      id: input.id,
      instanceId: input.instanceId,
      nodeInstanceId: input.nodeInstanceId,
      ...(input.snapshotId ? { snapshotId: input.snapshotId } : {}),
      adapterId: input.adapterId,
      resourceId: input.resourceId,
      operation: input.operation,
      status: input.status,
      payload: clone(input.payload),
      preconditions: clone(input.preconditions),
      ...(input.dryRunResult ? { dryRunResult: clone(input.dryRunResult) } : {}),
      ...(input.applyResult ? { applyResult: clone(input.applyResult) } : {}),
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      ...(input.causationId ? { causationId: input.causationId } : {}),
      ...(input.effectiveAt ? { effectiveAt: input.effectiveAt } : {}),
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };
    this.intents.set(intent.id, intent);
    return { intent: clone(intent), created: true };
  }

  async loadChangeIntent(instanceId: string, intentId: string) {
    return clone([...this.intents.values()].find((intent) => intent.instanceId === instanceId && intent.id === intentId) ?? null);
  }

  async updateChangeIntentApplyResult(input: WorkflowRuntimeChangeIntentApplyUpdate) {
    const current = this.intents.get(input.intentId);
    if (!current || current.instanceId !== input.instanceId) throw new Error("Intent not found.");
    const updated: WorkflowRuntimeChangeIntentRecord = {
      ...current,
      status: input.status,
      ...(input.dryRunResult ? { dryRunResult: clone(input.dryRunResult) } : {}),
      applyResult: clone(input.applyResult),
      ...(input.approvedByUserId ? { approvedByUserId: input.approvedByUserId } : {}),
      ...(input.approvedAt ? { approvedAt: input.approvedAt } : {}),
      ...(input.appliedAt ? { appliedAt: input.appliedAt } : {}),
      updatedAt: input.appliedAt ?? input.approvedAt ?? current.updatedAt,
    };
    this.intents.set(updated.id, updated);
    return clone(updated);
  }

  async enqueueOutbox(input: WorkflowOutboxEnqueueInput): Promise<WorkflowRuntimeOutboxWriteResult> {
    const duplicate = [...this.outbox.values()].find((message) => (
      message.workflowInstanceId === input.workflowInstanceId && message.idempotencyKey === input.idempotencyKey
    ));
    if (duplicate) return { message: clone(duplicate), created: false };
    const message: WorkflowOutboxMessage = {
      id: input.id,
      workflowInstanceId: input.workflowInstanceId,
      ...(input.workflowNodeInstanceId ? { workflowNodeInstanceId: input.workflowNodeInstanceId } : {}),
      ...(input.workflowEventId ? { workflowEventId: input.workflowEventId } : {}),
      kind: input.kind,
      target: input.target,
      status: "pending",
      payload: clone(input.payload),
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      ...(input.causationId ? { causationId: input.causationId } : {}),
      attempt: 1,
      maxAttempts: input.maxAttempts ?? 3,
      availableAt: input.availableAt,
      createdAt: input.availableAt,
      updatedAt: input.availableAt,
    };
    this.outbox.set(message.id, message);
    return { message: clone(message), created: true };
  }

  async findRoleBinding(workflowVersionId: string, workflowRole: string, permission: string): Promise<WorkflowRuntimeRoleBindingRecord | null> {
    return clone([...this.roleBindings.values()].find((binding) => (
      binding.workflowVersionId === workflowVersionId
      && binding.workflowRole === workflowRole
      && binding.permissions.includes(permission)
    )) ?? null);
  }

  async writeTask(): Promise<{ task: WorkflowTaskRecord; created: boolean }> {
    throw new Error("writeTask is not implemented in this runtime-engine fixture.");
  }

  async loadTask(taskId: string) {
    return clone(this.tasks.get(taskId) ?? null);
  }

  async updateTask(input: WorkflowTaskMutation): Promise<WorkflowTaskRecord> {
    const current = this.tasks.get(input.taskId);
    if (!current) throw new Error("Task not found.");
    const updated: WorkflowTaskRecord = {
      ...current,
      status: input.status,
      ...(input.claimedByUserId ? { claimedByUserId: input.claimedByUserId } : {}),
      ...(input.outcome ? { outcome: input.outcome } : {}),
      ...(input.formData ? { formData: input.formData } : {}),
      ...(input.completionComment ? { completionComment: input.completionComment } : {}),
      ...(input.claimedAt ? { claimedAt: input.claimedAt } : {}),
      ...(input.completedAt ? { completedAt: input.completedAt } : {}),
    };
    this.tasks.set(updated.id, updated);
    return clone(updated);
  }

  async listTasksForGroups(_identityGroups: readonly string[], _statuses?: readonly WorkflowTaskStatus[]) {
    return clone([...this.tasks.values()]);
  }

  async listOverdueTasks(now: string) {
    return clone([...this.tasks.values()].filter((task) => (
      ["open", "claimed"].includes(task.status)
      && task.deadlineAt
      && task.deadlineAt <= now
    )));
  }
}

class FakeLookupReads {
  readonly calls: unknown[] = [];
  constructor(readonly records: readonly ClientConfigReadRecord[]) {}

  async select(request: unknown): Promise<readonly ClientConfigReadRecord[]> {
    this.calls.push({ method: "select", request: clone(request) });
    return clone(this.records);
  }

  async search(request: unknown): Promise<readonly ClientConfigReadRecord[]> {
    this.calls.push({ method: "search", request: clone(request) });
    return clone(this.records);
  }
}

class FakeMutationContract {
  readonly calls: unknown[] = [];
  constructor(readonly result: MutationDryRunResult = {
    status: "ready",
    adapterId: "client-config.portfolio-configuration.update.v1",
    stageHandlerId: "stage_change_portfolio_configuration",
    applyStrategy: "staged_portfolio_configuration",
    issues: [],
  }) {}

  async dryRun(request: unknown): Promise<MutationDryRunResult> {
    this.calls.push(clone(request));
    return clone(this.result);
  }
}

class FakeApplyMutationContract {
  readonly dryRunCalls: unknown[] = [];
  readonly applyCalls: unknown[] = [];

  constructor(
    readonly dryRunResult: MutationDryRunResult,
    readonly applyResult: MutationExecutionResult = {
      status: "applied",
      adapterId: "client-config.portfolio-configuration.update.v1",
      appliedResourceId: "HOR*EQALT*MAN",
      auditReference: "audit-1",
      message: "Applied.",
    },
  ) {}

  async dryRun(request: unknown): Promise<MutationDryRunResult> {
    this.dryRunCalls.push(clone(request));
    return clone(this.dryRunResult);
  }

  async apply(request: unknown): Promise<MutationExecutionResult> {
    this.applyCalls.push(clone(request));
    return clone(this.applyResult);
  }
}

const occurredAt = "2026-08-11T08:00:00.000Z";
const actor = { type: "user", id: "user-1", sessionId: "session-1" } as const;

function succeed(node: WorkflowRuntimeNodeRecord, commandId: string, selectedOutputPort?: string): WorkflowRuntimeCommand {
  return {
    type: "succeed_node",
    commandId,
    instanceId: node.instanceId,
    nodeInstanceId: node.nodeInstanceId,
    expectedStatus: "running",
    actor,
    correlationId: "correlation-1",
    occurredAt,
    ...(selectedOutputPort ? { selectedOutputPort } : {}),
  };
}

describe("transactional workflow runtime engine", () => {
  it("keeps the PostgreSQL adapter contract explicit about transactions, row locks and idempotent inserts", async () => {
    const source = await fs.readFile(path.resolve(__dirname, "..", "lib", "workflow-studio", "runtime-postgres-store.ts"), "utf8");
    expect(source).toContain("this.sql.begin");
    expect(source).toContain("WHERE id = ${instanceId} FOR UPDATE");
    expect(source).toContain("FOR UPDATE OF ni SKIP LOCKED");
    expect(source).toContain("ON CONFLICT (tenant, idempotency_key) DO NOTHING");
    expect(source).toContain("ON CONFLICT (workflow_instance_id, idempotency_key) DO NOTHING");
  });

  it("creates a pinned instance and persists the start token atomically", async () => {
    const store = new MemoryRuntimeStore();
    const engine = new WorkflowRuntimeEngine(store);
    const result = await engine.start({
      workflowVersionId: "version-1",
      instanceId: "instance-1",
      idempotencyKey: "start-command",
      correlationId: "correlation-1",
      actor,
      input: { request: "benchmark switch" },
      clientIds: ["client-a"],
      occurredAt,
    });

    expect(result.instance).toMatchObject({
      instanceId: "instance-1",
      workflowVersionId: "version-1",
      status: "running",
      clientIds: ["client-a"],
      input: { request: "benchmark switch" },
    });
    expect(result.activatedNodes).toHaveLength(1);
    expect(result.activatedNodes[0]).toMatchObject({ nodeKey: "start", status: "ready", attempt: 1 });
    expect(result.events.map((event) => event.eventType)).toEqual([
      "workflow.instance.started",
      "workflow.node.activated",
    ]);
    expect(store.transactionCount).toBe(1);
  });

  it("returns the recorded result for a duplicate start without a second token or event", async () => {
    const store = new MemoryRuntimeStore();
    const engine = new WorkflowRuntimeEngine(store);
    const input = {
      workflowVersionId: "version-1",
      instanceId: "instance-1",
      idempotencyKey: "start-command",
      correlationId: "correlation-1",
      actor,
      occurredAt,
    } as const;
    await engine.start(input);
    const duplicate = await engine.start({ ...input, instanceId: "ignored-instance" });

    expect(duplicate.deduplicated).toBe(true);
    expect(duplicate.instance.instanceId).toBe("instance-1");
    expect(store.instances).toHaveLength(1);
    expect(store.nodes).toHaveLength(1);
    expect(store.events).toHaveLength(2);
  });

  it("claims durable ready tokens with a lease and resumes them after a fresh engine is created", async () => {
    const store = new MemoryRuntimeStore();
    const firstEngine = new WorkflowRuntimeEngine(store);
    await firstEngine.start({
      workflowVersionId: "version-1",
      instanceId: "instance-1",
      idempotencyKey: "start-command",
      correlationId: "correlation-1",
      actor,
      occurredAt,
    });

    const resumedEngine = new WorkflowRuntimeEngine(store);
    const claimed = await resumedEngine.claimNext({
      instanceId: "instance-1",
      commandId: "claim-start",
      workerId: "worker-1",
      leaseDurationMs: 60_000,
      correlationId: "correlation-1",
      occurredAt,
    });

    expect(claimed?.state).toMatchObject({
      kind: "node",
      status: "running",
      leaseOwner: "worker-1",
      leaseExpiresAt: "2026-08-11T08:01:00.000Z",
    });
    const duplicate = await resumedEngine.claimNext({
      instanceId: "instance-1",
      commandId: "claim-start",
      workerId: "worker-1",
      leaseDurationMs: 60_000,
      correlationId: "correlation-1",
      occurredAt,
    });
    expect(duplicate?.deduplicated).toBe(true);
    expect([...store.nodes.values()].filter((node) => node.status === "running")).toHaveLength(1);
  });

  it("processes edges once and never creates duplicate successor attempts on redelivery", async () => {
    const store = new MemoryRuntimeStore();
    const engine = new WorkflowRuntimeEngine(store);
    await engine.start({ workflowVersionId: "version-1", instanceId: "instance-1", idempotencyKey: "start-command", correlationId: "correlation-1", actor, occurredAt });
    const claimed = await engine.claimNext({ instanceId: "instance-1", commandId: "claim-start", workerId: "worker-1", leaseDurationMs: 60_000, correlationId: "correlation-1", occurredAt });
    const startNode = claimed!.state as WorkflowRuntimeNodeRecord;
    const first = await engine.execute(succeed(startNode, "complete-start"));
    const duplicate = await engine.execute(succeed(startNode, "complete-start"));

    expect(first.activatedNodes).toHaveLength(1);
    expect(first.activatedNodes[0]).toMatchObject({ nodeKey: "task", executionKind: "human", status: "ready" });
    expect(duplicate.deduplicated).toBe(true);
    expect([...store.nodes.values()].filter((node) => node.nodeKey === "task")).toHaveLength(1);
    expect(store.events.filter((event) => event.eventType === "workflow.node.activated" && event.payload.nodeKey === "task")).toHaveLength(1);
  });

  it("completes an end-to-end graph and pins the terminal result", async () => {
    const store = new MemoryRuntimeStore();
    const engine = new WorkflowRuntimeEngine(store);
    await engine.start({ workflowVersionId: "version-1", instanceId: "instance-1", idempotencyKey: "start-command", correlationId: "correlation-1", actor, occurredAt });

    for (const [claimId, completeId] of [["claim-start", "done-start"], ["claim-task", "done-task"], ["claim-end", "done-end"]]) {
      const claimed = await engine.claimNext({ instanceId: "instance-1", commandId: claimId, workerId: "worker-1", leaseDurationMs: 60_000, correlationId: "correlation-1", occurredAt });
      expect(claimed).not.toBeNull();
      await engine.execute(succeed(claimed!.state as WorkflowRuntimeNodeRecord, completeId));
    }

    expect(store.instances.get("instance-1")).toMatchObject({
      status: "completed",
      result: { terminalNodeKey: "end" },
    });
    expect(store.events.at(-1)?.eventType).toBe("workflow.instance.completed");
    expect(await engine.claimNext({ instanceId: "instance-1", commandId: "nothing", workerId: "worker-1", leaseDurationMs: 60_000, correlationId: "correlation-1", occurredAt })).toBeNull();
  });

  it("rolls back node state and audit event when edge processing fails", async () => {
    const conditionalGraph: WorkflowRuntimeGraph = {
      ...clone(graph),
      edges: graph.edges.map((edge, index) => index === 0 ? { ...edge, condition: { variable: "later" } } : edge),
    };
    const store = new MemoryRuntimeStore(conditionalGraph);
    const engine = new WorkflowRuntimeEngine(store);
    await engine.start({ workflowVersionId: "version-1", instanceId: "instance-1", idempotencyKey: "start-command", correlationId: "correlation-1", actor, occurredAt });
    const claimed = await engine.claimNext({ instanceId: "instance-1", commandId: "claim-start", workerId: "worker-1", leaseDurationMs: 60_000, correlationId: "correlation-1", occurredAt });
    const running = claimed!.state as WorkflowRuntimeNodeRecord;
    const eventCount = store.events.length;

    await expect(engine.execute(succeed(running, "complete-start"))).rejects.toMatchObject({
      issues: [expect.objectContaining({ code: "type_mismatch", nodeInstanceId: running.nodeInstanceId, edgeId: "edge-start-task" })],
    });
    expect(store.nodes.get(running.nodeInstanceId)?.status).toBe("running");
    expect(store.events).toHaveLength(eventCount);
  });

  it("persists typed node outputs before safely evaluating conditional edges", async () => {
    const conditionalGraph: WorkflowRuntimeGraph = {
      ...clone(graph),
      edges: graph.edges.map((edge, index) => index === 0 ? {
        ...edge,
        condition: { kind: "condition", variableId: "amount", valueType: "number", operator: "greater_than", value: 100 },
      } : edge),
    };
    const store = new MemoryRuntimeStore(conditionalGraph);
    const engine = new WorkflowRuntimeEngine(store);
    await engine.start({ workflowVersionId: "version-1", instanceId: "instance-1", idempotencyKey: "start-command", correlationId: "correlation-1", actor, occurredAt });
    const claimed = await engine.claimNext({ instanceId: "instance-1", commandId: "claim-start", workerId: "worker-1", leaseDurationMs: 60_000, correlationId: "correlation-1", occurredAt });
    const command = succeed(claimed!.state as WorkflowRuntimeNodeRecord, "complete-start") as Extract<WorkflowRuntimeCommand, { type: "succeed_node" }>;
    const result = await engine.execute({
      ...command,
      outputVariables: [{ name: "amount", dataType: "number", value: 250, classification: "confidential" }],
    });

    expect(result.variables).toEqual([expect.objectContaining({
      name: "amount",
      dataType: "number",
      value: 250,
      scope: "node_output",
      sourceNodeInstanceId: claimed!.state.kind === "node" ? claimed!.state.nodeInstanceId : undefined,
      classification: "confidential",
    })]);
    expect(result.activatedNodes).toEqual([expect.objectContaining({ nodeKey: "task" })]);
  });

  it("evaluates decision nodes deterministically and audits the chosen route", async () => {
    const decisionGraph: WorkflowRuntimeGraph = {
      ...clone(graph),
      nodes: [
        graph.nodes[0]!,
        {
          id: "node-decision",
          workflowVersionId: "version-1",
          nodeKey: "route",
          blockType: "decision",
          configuration: {
            label: "Materieel?",
            rule: { kind: "condition", variableId: "amount", valueType: "number", operator: "greater_than", value: 100 },
          },
        },
        graph.nodes[1]!,
        graph.nodes[2]!,
      ],
      edges: [
        { id: "edge-start-decision", workflowVersionId: "version-1", edgeKey: "start_decision", sourceNodeId: "node-start", sourcePort: "out", targetNodeId: "node-decision", targetPort: "in", condition: null },
        { id: "edge-decision-task", workflowVersionId: "version-1", edgeKey: "decision_task", sourceNodeId: "node-decision", sourcePort: "matched", targetNodeId: "node-task", targetPort: "in", condition: null },
        { id: "edge-decision-end", workflowVersionId: "version-1", edgeKey: "decision_end", sourceNodeId: "node-decision", sourcePort: "otherwise", targetNodeId: "node-end", targetPort: "in", condition: null },
      ],
    };
    const store = new MemoryRuntimeStore(decisionGraph);
    const engine = new WorkflowRuntimeEngine(store);
    await engine.start({ workflowVersionId: "version-1", instanceId: "instance-1", idempotencyKey: "start-command", correlationId: "correlation-1", actor, occurredAt });
    const startClaim = await engine.claimNext({ instanceId: "instance-1", commandId: "claim-start", workerId: "worker-1", leaseDurationMs: 60_000, correlationId: "correlation-1", occurredAt });
    const startDone = succeed(startClaim!.state as WorkflowRuntimeNodeRecord, "complete-start") as Extract<WorkflowRuntimeCommand, { type: "succeed_node" }>;
    await engine.execute({
      ...startDone,
      outputVariables: [{ name: "amount", dataType: "number", value: 250, classification: "confidential" }],
    });
    const decisionClaim = await engine.claimNext({ instanceId: "instance-1", commandId: "claim-decision", workerId: "worker-1", leaseDurationMs: 60_000, correlationId: "correlation-1", occurredAt });

    const result = await engine.executeDecision({
      instanceId: "instance-1",
      nodeInstanceId: (decisionClaim!.state as WorkflowRuntimeNodeRecord).nodeInstanceId,
      commandId: "evaluate-decision",
      actor: { type: "system", id: "worker-1" },
      correlationId: "correlation-1",
      occurredAt,
    });

    expect(result.activatedNodes).toEqual([expect.objectContaining({ nodeKey: "task" })]);
    expect(result.events.at(-1)).toMatchObject({
      eventType: "workflow.decision.evaluated",
      payload: {
        nodeKey: "route",
        matched: true,
        outputPort: "matched",
        chosenEdgeId: "edge-decision-task",
        inputs: { amount: 250 },
      },
    });
    expect(String(result.events.at(-1)?.payload.explanation)).toContain("amount (number) greater_than 100");
  });

  it("stops decision execution when the selected route is missing or ambiguous", async () => {
    const decisionNode: WorkflowRuntimeNodeDefinition = {
      id: "node-decision",
      workflowVersionId: "version-1",
      nodeKey: "route",
      blockType: "decision",
      configuration: {
        label: "Materieel?",
        rule: { kind: "condition", variableId: "amount", valueType: "number", operator: "greater_than", value: 100 },
      },
    };
    const baseInstance: WorkflowRuntimeInstanceRecord = {
      kind: "instance",
      instanceId: "instance-1",
      workflowVersionId: "version-1",
      tenant: "tenant-a",
      businessUnit: "bu-a",
      clientIds: null,
      status: "running",
      idempotencyKey: "start-command",
      correlationId: "correlation-1",
      startedByUserId: "user-1",
      input: {},
    };
    const runningDecision: WorkflowRuntimeNodeRecord = {
      kind: "node",
      instanceId: "instance-1",
      nodeInstanceId: "decision-instance",
      workflowVersionId: "version-1",
      workflowNodeId: "node-decision",
      nodeKey: "route",
      blockType: "decision",
      executionKind: "automated",
      status: "running",
      attempt: 1,
      maxAttempts: 3,
      input: {},
      idempotencyKey: "decision",
      correlationId: "correlation-1",
      availableAt: occurredAt,
      startedAt: occurredAt,
    };

    for (const scenario of [
      { edges: [] as WorkflowRuntimeEdgeDefinition[], code: "decision_route_not_found" },
      {
        edges: [
          { id: "edge-a", workflowVersionId: "version-1", edgeKey: "a", sourceNodeId: "node-decision", sourcePort: "matched", targetNodeId: "node-task", targetPort: "in", condition: null },
          { id: "edge-b", workflowVersionId: "version-1", edgeKey: "b", sourceNodeId: "node-decision", sourcePort: "matched", targetNodeId: "node-end", targetPort: "in", condition: null },
        ] as WorkflowRuntimeEdgeDefinition[],
        code: "decision_route_ambiguous",
      },
    ]) {
      const store = new MemoryRuntimeStore({
        ...clone(graph),
        nodes: [decisionNode, graph.nodes[1]!, graph.nodes[2]!],
        edges: scenario.edges,
      });
      store.instances.set("instance-1", clone(baseInstance));
      store.nodes.set("decision-instance", clone(runningDecision));
      await store.writeVariable({
        id: `var-amount-${scenario.code}`,
        instanceId: "instance-1",
        assignment: { name: "amount", dataType: "number", value: 250, classification: "confidential" },
        idempotencyKey: `var-amount-${scenario.code}`,
        correlationId: "correlation-1",
      });

      await expect(new WorkflowRuntimeEngine(store).executeDecision({
        instanceId: "instance-1",
        nodeInstanceId: "decision-instance",
        commandId: "evaluate-decision",
        actor,
        correlationId: "correlation-1",
        occurredAt,
      })).rejects.toMatchObject({ code: scenario.code });
      expect(store.nodes.get("decision-instance")?.status).toBe("running");
      expect([...store.nodes.values()].filter((node) => node.nodeKey !== "route")).toHaveLength(0);
      expect(store.events).toHaveLength(0);
    }
  });

  it("executes a client-config lookup, persists an auditable snapshot and exposes selected fields as a variable", async () => {
    const lookupGraph: WorkflowRuntimeGraph = {
      ...clone(graph),
      nodes: [
        graph.nodes[0]!,
        {
          id: "node-lookup",
          workflowVersionId: "version-1",
          nodeKey: "lookup_client",
          blockType: "client_config_lookup",
          configuration: {
            resourceId: "client",
            filters: [{ attributeId: "code", source: "literal", value: "HOR" }],
            displayFields: ["code", "name"],
            selection: "one",
            outputVariable: "client_snapshot",
          },
        },
        graph.nodes[2]!,
      ],
      edges: [
        { ...graph.edges[0]!, id: "edge-start-lookup", edgeKey: "start_lookup", targetNodeId: "node-lookup" },
        { ...graph.edges[1]!, id: "edge-lookup-end", edgeKey: "lookup_end", sourceNodeId: "node-lookup" },
      ],
    };
    const store = new MemoryRuntimeStore(lookupGraph);
    const reads = new FakeLookupReads([{
      resourceId: "client",
      sourceRecordId: "HOR",
      fields: { code: "HOR", name: "Horizon" },
      concurrencyToken: "sha256:lookup-token",
    }]);
    const engine = new WorkflowRuntimeEngine(store, reads);
    await engine.start({ workflowVersionId: "version-1", instanceId: "instance-1", idempotencyKey: "start-command", correlationId: "correlation-1", actor, occurredAt, clientIds: ["client-a"] });
    const started = await engine.claimNext({ instanceId: "instance-1", commandId: "claim-start", workerId: "worker-1", leaseDurationMs: 60_000, correlationId: "correlation-1", occurredAt });
    await engine.execute(succeed(started!.state as WorkflowRuntimeNodeRecord, "complete-start"));
    const claimedLookup = await engine.claimNext({ instanceId: "instance-1", commandId: "claim-lookup", workerId: "worker-1", leaseDurationMs: 60_000, correlationId: "correlation-1", occurredAt });

    const result = await engine.executeClientConfigLookup({
      instanceId: "instance-1",
      nodeInstanceId: (claimedLookup!.state as WorkflowRuntimeNodeRecord).nodeInstanceId,
      commandId: "execute-lookup",
      identity: {
        userId: "user-1",
        displayName: "Gebruiker",
        groups: ["bcm:role:change_manager"],
        tenant: "tenant-a",
        businessUnit: "bu-a",
        sessionId: "session-1",
      },
      actor,
      correlationId: "correlation-1",
      occurredAt,
    });

    expect(reads.calls).toEqual([expect.objectContaining({
      method: "select",
      request: expect.objectContaining({
        resourceId: "client",
        scope: { tenant: "tenant-a", businessUnit: "bu-a", clientIds: ["client-a"] },
        filters: [{ attributeId: "code", value: "HOR" }],
        fields: ["code", "name"],
      }),
    })]);
    expect([...store.snapshots.values()]).toEqual([expect.objectContaining({
      resourceId: "client",
      sourceRecordId: "HOR",
      selectedFields: { code: "HOR", name: "Horizon" },
      concurrencyToken: "sha256:lookup-token",
      readAt: occurredAt,
    })]);
    expect(result.variables).toEqual([expect.objectContaining({
      name: "client_snapshot",
      dataType: "object",
      value: expect.objectContaining({
        code: "HOR",
        name: "Horizon",
        _snapshot: expect.objectContaining({
          resourceId: "client",
          sourceRecordId: "HOR",
          concurrencyToken: "sha256:lookup-token",
          readAt: occurredAt,
        }),
      }),
      classification: "confidential",
    })]);
    expect(result.activatedNodes).toEqual([expect.objectContaining({ nodeKey: "end" })]);
    expect(result.events.map((event) => event.eventType)).toContain("workflow.lookup.snapshotted");
  });

  it("materializes change intents, dry-runs the adapter and stages a governed reference", async () => {
    const changeGraph: WorkflowRuntimeGraph = {
      ...clone(graph),
      nodes: [{
        id: "node-change",
        workflowVersionId: "version-1",
        nodeKey: "stage_change",
        blockType: "change_request",
        configuration: {
          resourceId: "portfolio_configuration",
          operation: "UPDATE",
          attributeMappings: [{
            attributeId: "benchmark_code",
            ist: { snapshotVariableId: "pc_snapshot", snapshotAttributeId: "benchmark_code" },
            soll: { variableId: "new_benchmark" },
          }],
          effectiveDateVariable: "effective_date",
          rationaleVariable: "rationale",
        },
      }, graph.nodes[2]!],
      edges: [
        { id: "edge-change-end", workflowVersionId: "version-1", edgeKey: "change_end", sourceNodeId: "node-change", sourcePort: "out", targetNodeId: "node-end", targetPort: "in", condition: null },
      ],
    };
    const store = new MemoryRuntimeStore(changeGraph);
    store.instances.set("instance-1", { kind: "instance", instanceId: "instance-1", workflowVersionId: "version-1", tenant: "tenant-a", businessUnit: "bu-a", clientIds: ["client-a"], status: "running", idempotencyKey: "start-command", correlationId: "correlation-1", startedByUserId: "user-1", input: {} });
    store.nodes.set("change-instance", { kind: "node", instanceId: "instance-1", nodeInstanceId: "change-instance", workflowVersionId: "version-1", workflowNodeId: "node-change", nodeKey: "stage_change", blockType: "change_request", executionKind: "automated", status: "running", attempt: 1, maxAttempts: 3, input: {}, idempotencyKey: "change", correlationId: "correlation-1", availableAt: occurredAt, startedAt: occurredAt });
    store.snapshots.set("snapshot-1", { id: "snapshot-1", instanceId: "instance-1", sourceNodeInstanceId: "lookup-instance", resourceId: "portfolio_configuration", sourceRecordId: "HOR*EQALT*MAN", selectedFields: { benchmark_code: "OLD" }, concurrencyToken: "sha256:snapshot", snapshotVersion: 1, idempotencyKey: "snapshot", correlationId: "correlation-1", readAt: occurredAt });
    await store.writeVariable({ id: "var-snapshot", instanceId: "instance-1", assignment: { name: "pc_snapshot", dataType: "object", value: { benchmark_code: "OLD", _snapshot: { id: "snapshot-1" } }, classification: "confidential" }, idempotencyKey: "var-snapshot", correlationId: "correlation-1" });
    await store.writeVariable({ id: "var-benchmark", instanceId: "instance-1", assignment: { name: "new_benchmark", dataType: "string", value: "NEW", classification: "confidential" }, idempotencyKey: "var-benchmark", correlationId: "correlation-1" });
    await store.writeVariable({ id: "var-date", instanceId: "instance-1", assignment: { name: "effective_date", dataType: "date", value: "2026-09-01", classification: "confidential" }, idempotencyKey: "var-date", correlationId: "correlation-1" });
    await store.writeVariable({ id: "var-rationale", instanceId: "instance-1", assignment: { name: "rationale", dataType: "string", value: "Benchmarkwissel goedgekeurd.", classification: "confidential" }, idempotencyKey: "var-rationale", correlationId: "correlation-1" });
    const mutations = new FakeMutationContract();

    const result = await new WorkflowRuntimeEngine(store, undefined, mutations).executeChangeRequest({
      instanceId: "instance-1",
      nodeInstanceId: "change-instance",
      commandId: "stage-change",
      identity: { userId: "user-1", displayName: "User", groups: ["bcm:role:change_manager"], tenant: "tenant-a", businessUnit: "bu-a", sessionId: "session-1" },
      actor,
      correlationId: "correlation-1",
      occurredAt,
    });

    expect(mutations.calls).toHaveLength(1);
    expect(mutations.calls[0]).toMatchObject({
      scope: { tenant: "tenant-a", businessUnit: "bu-a", clientIds: ["client-a"] },
      intent: {
        resourceId: "portfolio_configuration",
        operation: "UPDATE",
        values: { benchmark_code: "NEW" },
        effectiveAt: "2026-09-01",
        rationale: "Benchmarkwissel goedgekeurd.",
        preconditions: {
          expectedValues: { benchmark_code: "OLD" },
          snapshot: { resourceId: "portfolio_configuration", sourceRecordId: "HOR*EQALT*MAN", concurrencyToken: "sha256:snapshot" },
        },
      },
    });
    expect([...store.intents.values()]).toEqual([expect.objectContaining({
      resourceId: "portfolio_configuration",
      operation: "UPDATE",
      status: "validated",
      snapshotId: "snapshot-1",
      payload: { values: { benchmark_code: "NEW" }, rationale: "Benchmarkwissel goedgekeurd." },
      applyResult: expect.objectContaining({ status: "staged", stagingReference: "stage_change_portfolio_configuration:stage-change" }),
    })]);
    expect(result.activatedNodes).toEqual([expect.objectContaining({ nodeKey: "end" })]);
    expect(result.events[0]).toMatchObject({
      eventType: "workflow.change_intent.materialized",
      payload: { dryRunStatus: "ready", stagingReference: "stage_change_portfolio_configuration:stage-change", snapshotId: "snapshot-1" },
    });
  });

  it("persists conflicted change intent dry-runs without activating successors", async () => {
    const store = new MemoryRuntimeStore({
      ...clone(graph),
      nodes: [{
        id: "node-change",
        workflowVersionId: "version-1",
        nodeKey: "stage_change",
        blockType: "change_request",
        configuration: {
          resourceId: "portfolio_configuration",
          operation: "UPDATE",
          attributeMappings: [{
            attributeId: "benchmark_code",
            ist: { snapshotVariableId: "pc_snapshot", snapshotAttributeId: "benchmark_code" },
            soll: { variableId: "new_benchmark" },
          }],
          effectiveDateVariable: "effective_date",
          rationaleVariable: "rationale",
        },
      }],
      edges: [],
    });
    store.instances.set("instance-1", { kind: "instance", instanceId: "instance-1", workflowVersionId: "version-1", tenant: "tenant-a", businessUnit: "bu-a", clientIds: null, status: "running", idempotencyKey: "start-command", correlationId: "correlation-1", startedByUserId: "user-1", input: {} });
    store.nodes.set("change-instance", { kind: "node", instanceId: "instance-1", nodeInstanceId: "change-instance", workflowVersionId: "version-1", workflowNodeId: "node-change", nodeKey: "stage_change", blockType: "change_request", executionKind: "automated", status: "running", attempt: 1, maxAttempts: 3, input: {}, idempotencyKey: "change", correlationId: "correlation-1", availableAt: occurredAt, startedAt: occurredAt });
    store.snapshots.set("snapshot-1", { id: "snapshot-1", instanceId: "instance-1", sourceNodeInstanceId: "lookup-instance", resourceId: "portfolio_configuration", sourceRecordId: "HOR*EQALT*MAN", selectedFields: { benchmark_code: "OLD" }, concurrencyToken: "sha256:snapshot", snapshotVersion: 1, idempotencyKey: "snapshot", correlationId: "correlation-1", readAt: occurredAt });
    await store.writeVariable({ id: "var-snapshot", instanceId: "instance-1", assignment: { name: "pc_snapshot", dataType: "object", value: { benchmark_code: "OLD", _snapshot: { id: "snapshot-1" } }, classification: "confidential" }, idempotencyKey: "var-snapshot", correlationId: "correlation-1" });
    await store.writeVariable({ id: "var-benchmark", instanceId: "instance-1", assignment: { name: "new_benchmark", dataType: "string", value: "NEW", classification: "confidential" }, idempotencyKey: "var-benchmark", correlationId: "correlation-1" });
    await store.writeVariable({ id: "var-date", instanceId: "instance-1", assignment: { name: "effective_date", dataType: "date", value: "2026-09-01", classification: "confidential" }, idempotencyKey: "var-date", correlationId: "correlation-1" });
    await store.writeVariable({ id: "var-rationale", instanceId: "instance-1", assignment: { name: "rationale", dataType: "string", value: "Benchmarkwissel goedgekeurd.", classification: "confidential" }, idempotencyKey: "var-rationale", correlationId: "correlation-1" });

    const result = await new WorkflowRuntimeEngine(store, undefined, new FakeMutationContract({
      status: "conflicted",
      adapterId: "client-config.portfolio-configuration.update.v1",
      issues: [{ code: "concurrency_conflict", path: ["preconditions"], message: "Stale." }],
    })).executeChangeRequest({
      instanceId: "instance-1",
      nodeInstanceId: "change-instance",
      commandId: "stage-change",
      identity: { userId: "user-1", displayName: "User", groups: ["bcm:role:change_manager"], tenant: "tenant-a", businessUnit: "bu-a", sessionId: "session-1" },
      actor,
      correlationId: "correlation-1",
      occurredAt,
    });

    expect([...store.intents.values()]).toEqual([expect.objectContaining({ status: "conflicted", dryRunResult: expect.objectContaining({ status: "conflicted" }) })]);
    expect(store.nodes.get("change-instance")?.status).toBe("running");
    expect(result.activatedNodes).toHaveLength(0);
    expect(result.events).toEqual([expect.objectContaining({ eventType: "workflow.change_intent.materialized", payload: expect.objectContaining({ dryRunStatus: "conflicted", issueCodes: ["concurrency_conflict"] }) })]);
  });

  it("blocks stale change intents before apply and requires reload plus reapproval", async () => {
    const store = new MemoryRuntimeStore();
    store.instances.set("instance-1", { kind: "instance", instanceId: "instance-1", workflowVersionId: "version-1", tenant: "tenant-a", businessUnit: "bu-a", clientIds: ["client-a"], status: "running", idempotencyKey: "start-command", correlationId: "correlation-1", startedByUserId: "user-1", input: {} });
    store.nodes.set("change-instance", { kind: "node", instanceId: "instance-1", nodeInstanceId: "change-instance", workflowVersionId: "version-1", workflowNodeId: "node-task", nodeKey: "stage_change", blockType: "change_request", executionKind: "automated", status: "succeeded", attempt: 1, maxAttempts: 3, input: {}, idempotencyKey: "change", correlationId: "correlation-1", availableAt: occurredAt, startedAt: occurredAt, completedAt: occurredAt });
    store.intents.set("intent-1", {
      id: "intent-1",
      instanceId: "instance-1",
      nodeInstanceId: "change-instance",
      snapshotId: "snapshot-1",
      adapterId: "client-config.portfolio-configuration.update.v1",
      resourceId: "portfolio_configuration",
      operation: "UPDATE",
      status: "validated",
      payload: { values: { benchmark_code: "NEW" }, rationale: "Benchmarkwissel goedgekeurd." },
      preconditions: {
        snapshot: { snapshotVersion: 1, resourceId: "portfolio_configuration", sourceRecordId: "HOR*EQALT*MAN", selectedFields: { benchmark_code: "OLD" }, concurrencyToken: "sha256:old", readAt: occurredAt },
        expectedValues: { benchmark_code: "OLD" },
      },
      dryRunResult: { status: "ready", adapterId: "client-config.portfolio-configuration.update.v1", stageHandlerId: "stage_change_portfolio_configuration", applyStrategy: "staged_portfolio_configuration", issues: [] },
      applyResult: { status: "staged", adapterId: "client-config.portfolio-configuration.update.v1", stagingReference: "stage_change_portfolio_configuration:stage-change" },
      idempotencyKey: "stage-change",
      correlationId: "correlation-1",
      effectiveAt: "2026-09-01",
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });
    const mutations = new FakeApplyMutationContract({
      status: "conflicted",
      adapterId: "client-config.portfolio-configuration.update.v1",
      issues: [{ code: "concurrency_conflict", path: ["preconditions", "snapshot", "concurrencyToken"], message: "Stale." }],
    });

    const result = await new WorkflowRuntimeEngine(store, undefined, mutations).applyChangeIntent({
      instanceId: "instance-1",
      intentId: "intent-1",
      commandId: "apply-intent",
      identity: { userId: "checker-1", displayName: "Checker", groups: ["bcm:role:change_manager"], tenant: "tenant-a", businessUnit: "bu-a", sessionId: "session-1" },
      actor: { type: "user", id: "checker-1", sessionId: "session-1" },
      correlationId: "correlation-1",
      occurredAt,
    });

    expect(mutations.dryRunCalls).toHaveLength(1);
    expect(mutations.applyCalls).toHaveLength(0);
    expect(store.intents.get("intent-1")).toMatchObject({
      status: "conflicted",
      dryRunResult: { status: "conflicted" },
      applyResult: expect.objectContaining({ status: "conflicted", errorCode: "concurrency_conflict" }),
    });
    expect(result.events).toEqual([expect.objectContaining({
      eventType: "workflow.change_intent.apply_blocked",
      payload: expect.objectContaining({ requiresReloadAndReapproval: true, issueCodes: ["concurrency_conflict"] }),
    })]);
  });

  it("runs a final dry-run and applies a fresh change intent once", async () => {
    const store = new MemoryRuntimeStore();
    store.instances.set("instance-1", { kind: "instance", instanceId: "instance-1", workflowVersionId: "version-1", tenant: "tenant-a", businessUnit: "bu-a", clientIds: ["client-a"], status: "running", idempotencyKey: "start-command", correlationId: "correlation-1", startedByUserId: "user-1", input: {} });
    store.nodes.set("change-instance", { kind: "node", instanceId: "instance-1", nodeInstanceId: "change-instance", workflowVersionId: "version-1", workflowNodeId: "node-task", nodeKey: "stage_change", blockType: "change_request", executionKind: "automated", status: "succeeded", attempt: 1, maxAttempts: 3, input: {}, idempotencyKey: "change", correlationId: "correlation-1", availableAt: occurredAt, startedAt: occurredAt, completedAt: occurredAt });
    store.intents.set("intent-1", {
      id: "intent-1",
      instanceId: "instance-1",
      nodeInstanceId: "change-instance",
      adapterId: "client-config.portfolio-configuration.update.v1",
      resourceId: "portfolio_configuration",
      operation: "UPDATE",
      status: "approved",
      payload: { values: { benchmark_code: "NEW" }, rationale: "Benchmarkwissel goedgekeurd." },
      preconditions: {
        snapshot: { snapshotVersion: 1, resourceId: "portfolio_configuration", sourceRecordId: "HOR*EQALT*MAN", selectedFields: { benchmark_code: "OLD" }, concurrencyToken: "sha256:current", readAt: occurredAt },
        expectedValues: { benchmark_code: "OLD" },
      },
      dryRunResult: { status: "ready", adapterId: "client-config.portfolio-configuration.update.v1", stageHandlerId: "stage_change_portfolio_configuration", applyStrategy: "staged_portfolio_configuration", issues: [] },
      idempotencyKey: "stage-change",
      correlationId: "correlation-1",
      effectiveAt: "2026-09-01",
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });
    const mutations = new FakeApplyMutationContract({
      status: "ready",
      adapterId: "client-config.portfolio-configuration.update.v1",
      stageHandlerId: "stage_change_portfolio_configuration",
      applyStrategy: "staged_portfolio_configuration",
      issues: [],
    });

    const result = await new WorkflowRuntimeEngine(store, undefined, mutations).applyChangeIntent({
      instanceId: "instance-1",
      intentId: "intent-1",
      commandId: "apply-intent",
      identity: { userId: "checker-1", displayName: "Checker", groups: ["bcm:role:change_manager"], tenant: "tenant-a", businessUnit: "bu-a", sessionId: "session-1" },
      actor: { type: "user", id: "checker-1", sessionId: "session-1" },
      correlationId: "correlation-1",
      occurredAt,
    });

    expect(mutations.dryRunCalls).toHaveLength(1);
    expect(mutations.applyCalls).toHaveLength(1);
    expect(mutations.applyCalls[0]).toMatchObject({
      runtime: { workflowInstanceId: "instance-1", changeIntentId: "intent-1", causationId: "stage-change" },
      intent: { resourceId: "portfolio_configuration", operation: "UPDATE", values: { benchmark_code: "NEW" } },
    });
    expect(store.intents.get("intent-1")).toMatchObject({
      status: "applied",
      approvedByUserId: "checker-1",
      appliedAt: occurredAt,
      applyResult: expect.objectContaining({ status: "applied", appliedResourceId: "HOR*EQALT*MAN" }),
    });
    expect(result.events).toEqual([expect.objectContaining({ eventType: "workflow.change_intent.applied", payload: expect.objectContaining({ applyStatus: "applied" }) })]);
  });

  it("renders notification nodes safely and queues delivery through the outbox", async () => {
    const notificationGraph: WorkflowRuntimeGraph = {
      ...clone(graph),
      nodes: [
        {
          id: "node-notify",
          workflowVersionId: "version-1",
          nodeKey: "notify_asset_service",
          blockType: "notification",
          configuration: {
            recipientRoleIds: ["asset_service"],
            channel: "in_app",
            trigger: "on_reached",
            subjectTemplate: "Aanvraag {{ request_name }}",
            messageTemplate: "Controleer {{ request_name }} voor {{ client_name }}.",
            templateVariables: ["request_name", "client_name"],
          },
        },
        graph.nodes[2]!,
      ],
      edges: [
        { id: "edge-notify-end", workflowVersionId: "version-1", edgeKey: "notify_end", sourceNodeId: "node-notify", sourcePort: "out", targetNodeId: "node-end", targetPort: "in", condition: null },
      ],
    };
    const store = new MemoryRuntimeStore(notificationGraph);
    store.instances.set("instance-1", { kind: "instance", instanceId: "instance-1", workflowVersionId: "version-1", tenant: "tenant-a", businessUnit: "bu-a", clientIds: ["client-a"], status: "running", idempotencyKey: "start-command", correlationId: "correlation-1", startedByUserId: "user-1", input: {} });
    store.nodes.set("notification-instance", { kind: "node", instanceId: "instance-1", nodeInstanceId: "notification-instance", workflowVersionId: "version-1", workflowNodeId: "node-notify", nodeKey: "notify_asset_service", blockType: "notification", executionKind: "automated", status: "running", attempt: 1, maxAttempts: 3, input: {}, idempotencyKey: "notify", correlationId: "correlation-1", availableAt: occurredAt, startedAt: occurredAt });
    store.roleBindings.set("binding-1", { id: "binding-1", workflowVersionId: "version-1", workflowRole: "asset_service", identityGroup: "bcm:role:change_manager", permissions: ["workflow:tasks:execute"], tenant: "tenant-a", businessUnit: "bu-a", clientIds: ["client-a"] });
    await store.writeVariable({ id: "var-request", instanceId: "instance-1", assignment: { name: "request_name", dataType: "string", value: "<Benchmark & switch>", classification: "confidential" }, idempotencyKey: "var-request", correlationId: "correlation-1" });
    await store.writeVariable({ id: "var-client", instanceId: "instance-1", assignment: { name: "client_name", dataType: "string", value: "Horizon", classification: "confidential" }, idempotencyKey: "var-client", correlationId: "correlation-1" });

    const result = await new WorkflowRuntimeEngine(store).executeNotification({
      instanceId: "instance-1",
      nodeInstanceId: "notification-instance",
      commandId: "queue-notification",
      actor,
      correlationId: "correlation-1",
      occurredAt,
    });

    expect([...store.outbox.values()]).toEqual([expect.objectContaining({
      kind: "notification",
      target: "in_app",
      idempotencyKey: "queue-notification:notification:in_app",
      payload: expect.objectContaining({
        subject: "Aanvraag &lt;Benchmark &amp; switch&gt;",
        message: "Controleer &lt;Benchmark &amp; switch&gt; voor Horizon.",
        recipients: [expect.objectContaining({ workflowRole: "asset_service", identityGroup: "bcm:role:change_manager" })],
        links: { instance: "/workflow-runtime/instance-1" },
      }),
    })]);
    expect(result.events[0]).toMatchObject({
      eventType: "workflow.notification.queued",
      payload: { channel: "in_app", recipientRoles: ["asset_service"], recipientGroups: ["bcm:role:change_manager"], blocking: false },
    });
    expect(result.activatedNodes).toEqual([expect.objectContaining({ nodeKey: "end" })]);
  });

  it("queues allowlisted integration commands without exposing secret values", async () => {
    const integrationGraph: WorkflowRuntimeGraph = {
      ...clone(graph),
      nodes: [
        {
          id: "node-integration",
          workflowVersionId: "version-1",
          nodeKey: "post_update",
          blockType: "integration",
          configuration: {
            connectorId: "slack.post_message.v1",
            connectorVersion: 1,
            operation: "post_message",
            inputSchemaVersion: 1,
            outputSchemaVersion: 1,
            inputVariables: ["message"],
            outputVariable: "integration_delivery",
            secretRefs: [{ name: "bot_token", secretRef: "secret:slack.bot_token" }],
            timeoutMs: 5_000,
            retryPolicy: { maxAttempts: 4, backoff: "exponential" },
            signing: { mode: "hmac_sha256", secretRef: "secret:slack.signing" },
            sandboxMode: true,
          },
        },
        graph.nodes[2]!,
      ],
      edges: [
        { id: "edge-integration-end", workflowVersionId: "version-1", edgeKey: "integration_end", sourceNodeId: "node-integration", sourcePort: "out", targetNodeId: "node-end", targetPort: "in", condition: null },
      ],
    };
    const store = new MemoryRuntimeStore(integrationGraph);
    store.instances.set("instance-1", { kind: "instance", instanceId: "instance-1", workflowVersionId: "version-1", tenant: "tenant-a", businessUnit: "bu-a", clientIds: ["client-a"], status: "running", idempotencyKey: "start-command", correlationId: "correlation-1", startedByUserId: "user-1", input: {} });
    store.nodes.set("integration-instance", { kind: "node", instanceId: "instance-1", nodeInstanceId: "integration-instance", workflowVersionId: "version-1", workflowNodeId: "node-integration", nodeKey: "post_update", blockType: "integration", executionKind: "automated", status: "running", attempt: 1, maxAttempts: 3, input: {}, idempotencyKey: "integration", correlationId: "correlation-1", availableAt: occurredAt, startedAt: occurredAt });
    await store.writeVariable({ id: "var-message", instanceId: "instance-1", assignment: { name: "message", dataType: "string", value: "Klaar voor review", classification: "confidential" }, idempotencyKey: "var-message", correlationId: "correlation-1" });

    const result = await new WorkflowRuntimeEngine(store).executeIntegration({
      instanceId: "instance-1",
      nodeInstanceId: "integration-instance",
      commandId: "queue-integration",
      actor,
      correlationId: "correlation-1",
      occurredAt,
    });

    expect([...store.outbox.values()]).toEqual([expect.objectContaining({
      kind: "integration",
      target: "slack.post_message.v1",
      idempotencyKey: "queue-integration:integration:slack.post_message.v1",
      maxAttempts: 4,
      payload: expect.objectContaining({
        connectorId: "slack.post_message.v1",
        input: { message: "Klaar voor review" },
        secretReferences: [{ name: "bot_token", secretRef: "secret:slack.bot_token" }],
        signing: { mode: "hmac_sha256", secretRef: "secret:slack.signing" },
        sandboxMode: true,
      }),
    })]);
    expect(JSON.stringify([...store.outbox.values()][0]!.payload)).not.toContain("plain-text-secret");
    expect(result.events[0]).toMatchObject({
      eventType: "workflow.integration.queued",
      payload: { connectorId: "slack.post_message.v1", secretReferenceNames: ["bot_token"], sandboxMode: true },
    });
    expect([...store.variables.values()]).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "integration_delivery", value: expect.objectContaining({ connectorId: "slack.post_message.v1" }) }),
    ]));
    expect(result.activatedNodes).toEqual([expect.objectContaining({ nodeKey: "end" })]);
  });

  it("rolls back integration delivery when input variables are missing", async () => {
    const store = new MemoryRuntimeStore({
      ...clone(graph),
      nodes: [{
        id: "node-integration",
        workflowVersionId: "version-1",
        nodeKey: "post_update",
        blockType: "integration",
        configuration: {
          connectorId: "teams.post_message.v1",
          operation: "post_message",
          inputVariables: ["message"],
          sandboxMode: true,
        },
      }],
      edges: [],
    });
    store.instances.set("instance-1", { kind: "instance", instanceId: "instance-1", workflowVersionId: "version-1", tenant: "tenant-a", businessUnit: "bu-a", clientIds: null, status: "running", idempotencyKey: "start-command", correlationId: "correlation-1", startedByUserId: "user-1", input: {} });
    store.nodes.set("integration-instance", { kind: "node", instanceId: "instance-1", nodeInstanceId: "integration-instance", workflowVersionId: "version-1", workflowNodeId: "node-integration", nodeKey: "post_update", blockType: "integration", executionKind: "automated", status: "running", attempt: 1, maxAttempts: 3, input: {}, idempotencyKey: "integration", correlationId: "correlation-1", availableAt: occurredAt, startedAt: occurredAt });

    await expect(new WorkflowRuntimeEngine(store).executeIntegration({
      instanceId: "instance-1",
      nodeInstanceId: "integration-instance",
      commandId: "queue-integration",
      actor,
      correlationId: "correlation-1",
      occurredAt,
    })).rejects.toThrow(/Integratie-inputvariabelen ontbreken/);
    expect(store.outbox.size).toBe(0);
    expect(store.nodes.get("integration-instance")?.status).toBe("running");
  });

  it("rolls back notification delivery when template variables are missing", async () => {
    const store = new MemoryRuntimeStore({
      ...clone(graph),
      nodes: [{
        id: "node-notify",
        workflowVersionId: "version-1",
        nodeKey: "notify_asset_service",
        blockType: "notification",
        configuration: {
          recipientRoleIds: ["asset_service"],
          channel: "email",
          trigger: "on_reached",
          subjectTemplate: "Aanvraag {{ request_name }}",
          messageTemplate: "Controleer {{ request_name }}.",
          templateVariables: ["request_name"],
        },
      }],
      edges: [],
    });
    store.instances.set("instance-1", { kind: "instance", instanceId: "instance-1", workflowVersionId: "version-1", tenant: "tenant-a", businessUnit: "bu-a", clientIds: null, status: "running", idempotencyKey: "start-command", correlationId: "correlation-1", startedByUserId: "user-1", input: {} });
    store.nodes.set("notification-instance", { kind: "node", instanceId: "instance-1", nodeInstanceId: "notification-instance", workflowVersionId: "version-1", workflowNodeId: "node-notify", nodeKey: "notify_asset_service", blockType: "notification", executionKind: "automated", status: "running", attempt: 1, maxAttempts: 3, input: {}, idempotencyKey: "notify", correlationId: "correlation-1", availableAt: occurredAt, startedAt: occurredAt });
    store.roleBindings.set("binding-1", { id: "binding-1", workflowVersionId: "version-1", workflowRole: "asset_service", identityGroup: "bcm:role:change_manager", permissions: ["workflow:tasks:execute"], tenant: "tenant-a", businessUnit: "bu-a", clientIds: null });

    await expect(new WorkflowRuntimeEngine(store).executeNotification({
      instanceId: "instance-1",
      nodeInstanceId: "notification-instance",
      commandId: "queue-notification",
      actor,
      correlationId: "correlation-1",
      occurredAt,
    })).rejects.toMatchObject({ code: "invalid_graph" });

    expect(store.outbox.size).toBe(0);
    expect(store.events).toHaveLength(0);
    expect(store.nodes.get("notification-instance")?.status).toBe("running");
  });

  it("deduplicates lookup redelivery without writing a second snapshot or variable", async () => {
    const lookupGraph: WorkflowRuntimeGraph = {
      ...clone(graph),
      nodes: [
        graph.nodes[0]!,
        {
          id: "node-lookup",
          workflowVersionId: "version-1",
          nodeKey: "lookup_clients",
          blockType: "client_config_lookup",
          configuration: { resourceId: "client", selection: "many", outputVariable: "client_snapshots" },
        },
        graph.nodes[2]!,
      ],
      edges: [
        { ...graph.edges[0]!, id: "edge-start-lookup", edgeKey: "start_lookup", targetNodeId: "node-lookup" },
        { ...graph.edges[1]!, id: "edge-lookup-end", edgeKey: "lookup_end", sourceNodeId: "node-lookup" },
      ],
    };
    const store = new MemoryRuntimeStore(lookupGraph);
    const reads = new FakeLookupReads([
      { resourceId: "client", sourceRecordId: "HOR", fields: { code: "HOR" }, concurrencyToken: "sha256:one" },
      { resourceId: "client", sourceRecordId: "ZEK", fields: { code: "ZEK" }, concurrencyToken: "sha256:two" },
    ]);
    const engine = new WorkflowRuntimeEngine(store, reads);
    await engine.start({ workflowVersionId: "version-1", instanceId: "instance-1", idempotencyKey: "start-command", correlationId: "correlation-1", actor, occurredAt });
    const started = await engine.claimNext({ instanceId: "instance-1", commandId: "claim-start", workerId: "worker-1", leaseDurationMs: 60_000, correlationId: "correlation-1", occurredAt });
    await engine.execute(succeed(started!.state as WorkflowRuntimeNodeRecord, "complete-start"));
    const claimedLookup = await engine.claimNext({ instanceId: "instance-1", commandId: "claim-lookup", workerId: "worker-1", leaseDurationMs: 60_000, correlationId: "correlation-1", occurredAt });
    const lookupInput = {
      instanceId: "instance-1",
      nodeInstanceId: (claimedLookup!.state as WorkflowRuntimeNodeRecord).nodeInstanceId,
      commandId: "execute-lookup",
      identity: { userId: "user-1", displayName: "Gebruiker", groups: ["bcm:role:change_manager"], tenant: "tenant-a", businessUnit: "bu-a", sessionId: "session-1" },
      actor,
      correlationId: "correlation-1",
      occurredAt,
    };

    await engine.executeClientConfigLookup(lookupInput);
    const duplicate = await engine.executeClientConfigLookup(lookupInput);

    expect(duplicate.deduplicated).toBe(true);
    expect(store.snapshots.size).toBe(2);
    expect(store.variables.size).toBe(1);
    expect(reads.calls).toHaveLength(1);
  });

  it("narrows lookup reads through a scope-client parent binding", async () => {
    const lookupGraph: WorkflowRuntimeGraph = {
      ...clone(graph),
      nodes: [
        graph.nodes[0]!,
        {
          id: "node-lookup",
          workflowVersionId: "version-1",
          nodeKey: "lookup_bound_clients",
          blockType: "client_config_lookup",
          configuration: {
            resourceId: "client",
            parentBinding: { mode: "scope_client", sourceVariable: "bound_client" },
            selection: "many",
            outputVariable: "bound_client_snapshots",
          },
        },
        graph.nodes[2]!,
      ],
      edges: [
        { ...graph.edges[0]!, id: "edge-start-lookup", edgeKey: "start_lookup", targetNodeId: "node-lookup" },
        { ...graph.edges[1]!, id: "edge-lookup-end", edgeKey: "lookup_end", sourceNodeId: "node-lookup" },
      ],
    };
    const store = new MemoryRuntimeStore(lookupGraph);
    const reads = new FakeLookupReads([]);
    const engine = new WorkflowRuntimeEngine(store, reads);
    await engine.start({
      workflowVersionId: "version-1",
      instanceId: "instance-1",
      idempotencyKey: "start-command",
      correlationId: "correlation-1",
      actor,
      occurredAt,
      clientIds: ["client-a", "client-b"],
      variables: [{ name: "bound_client", dataType: "string", value: "client-a" }],
    });
    const started = await engine.claimNext({ instanceId: "instance-1", commandId: "claim-start", workerId: "worker-1", leaseDurationMs: 60_000, correlationId: "correlation-1", occurredAt });
    await engine.execute(succeed(started!.state as WorkflowRuntimeNodeRecord, "complete-start"));
    const claimedLookup = await engine.claimNext({ instanceId: "instance-1", commandId: "claim-lookup", workerId: "worker-1", leaseDurationMs: 60_000, correlationId: "correlation-1", occurredAt });

    await engine.executeClientConfigLookup({
      instanceId: "instance-1",
      nodeInstanceId: (claimedLookup!.state as WorkflowRuntimeNodeRecord).nodeInstanceId,
      commandId: "execute-lookup",
      identity: { userId: "user-1", displayName: "Gebruiker", groups: ["bcm:role:change_manager"], tenant: "tenant-a", businessUnit: "bu-a", sessionId: "session-1" },
      actor,
      correlationId: "correlation-1",
      occurredAt,
    });

    expect(reads.calls).toEqual([expect.objectContaining({
      method: "search",
      request: expect.objectContaining({
        scope: { tenant: "tenant-a", businessUnit: "bu-a", clientIds: ["client-a"] },
      }),
    })]);
  });

  it("stops with node-level diagnostics and rolls back an invalid typed output", async () => {
    const store = new MemoryRuntimeStore();
    const engine = new WorkflowRuntimeEngine(store);
    await engine.start({ workflowVersionId: "version-1", instanceId: "instance-1", idempotencyKey: "start-command", correlationId: "correlation-1", actor, occurredAt });
    const claimed = await engine.claimNext({ instanceId: "instance-1", commandId: "claim-start", workerId: "worker-1", leaseDurationMs: 60_000, correlationId: "correlation-1", occurredAt });
    const running = claimed!.state as WorkflowRuntimeNodeRecord;
    const eventCount = store.events.length;

    await expect(engine.execute({
      ...succeed(running, "complete-start"),
      outputVariables: [{ name: "amount", dataType: "number", value: "veel" }],
    } as WorkflowRuntimeCommand)).rejects.toMatchObject({
      issues: [expect.objectContaining({
        code: "invalid_value",
        variableName: "amount",
        expectedType: "number",
        nodeInstanceId: running.nodeInstanceId,
      })],
    });
    expect(store.nodes.get(running.nodeInstanceId)?.status).toBe("running");
    expect(store.variables).toHaveLength(0);
    expect(store.events).toHaveLength(eventCount);
  });

  it("waits at an AND join until every parallel branch has succeeded", async () => {
    const parallelGraph: WorkflowRuntimeGraph = {
      ...graph,
      nodes: [
        { id: "node-start", workflowVersionId: "version-1", nodeKey: "start", blockType: "manual_start", configuration: {} },
        { id: "node-split", workflowVersionId: "version-1", nodeKey: "split", blockType: "parallel_split", configuration: { label: "Split" } },
        { id: "node-left", workflowVersionId: "version-1", nodeKey: "left", blockType: "role_task", configuration: {} },
        { id: "node-right", workflowVersionId: "version-1", nodeKey: "right", blockType: "role_task", configuration: {} },
        { id: "node-join", workflowVersionId: "version-1", nodeKey: "join", blockType: "parallel_join", configuration: { label: "Join", mode: "and" } },
        { id: "node-end", workflowVersionId: "version-1", nodeKey: "end", blockType: "end", configuration: { outcome: "completed" } },
      ],
      edges: [
        { id: "edge-start-split", workflowVersionId: "version-1", edgeKey: "start_split", sourceNodeId: "node-start", sourcePort: "out", targetNodeId: "node-split", targetPort: "in", condition: null },
        { id: "edge-split-left", workflowVersionId: "version-1", edgeKey: "split_left", sourceNodeId: "node-split", sourcePort: "out", targetNodeId: "node-left", targetPort: "in", condition: null },
        { id: "edge-split-right", workflowVersionId: "version-1", edgeKey: "split_right", sourceNodeId: "node-split", sourcePort: "out", targetNodeId: "node-right", targetPort: "in", condition: null },
        { id: "edge-left-join", workflowVersionId: "version-1", edgeKey: "left_join", sourceNodeId: "node-left", sourcePort: "out", targetNodeId: "node-join", targetPort: "in", condition: null },
        { id: "edge-right-join", workflowVersionId: "version-1", edgeKey: "right_join", sourceNodeId: "node-right", sourcePort: "out", targetNodeId: "node-join", targetPort: "in", condition: null },
        { id: "edge-join-end", workflowVersionId: "version-1", edgeKey: "join_end", sourceNodeId: "node-join", sourcePort: "out", targetNodeId: "node-end", targetPort: "in", condition: null },
      ],
    };
    const store = new MemoryRuntimeStore(parallelGraph);
    const engine = new WorkflowRuntimeEngine(store);
    await engine.start({ workflowVersionId: "version-1", instanceId: "instance-1", idempotencyKey: "start-command", correlationId: "correlation-1", actor, occurredAt });

    const start = await engine.claimNext({ instanceId: "instance-1", commandId: "claim-start", workerId: "worker-1", leaseDurationMs: 60_000, correlationId: "correlation-1", occurredAt });
    await engine.execute(succeed(start!.state as WorkflowRuntimeNodeRecord, "complete-start"));
    const split = await engine.claimNext({ instanceId: "instance-1", commandId: "claim-split", workerId: "worker-1", leaseDurationMs: 60_000, correlationId: "correlation-1", occurredAt });
    await engine.executeParallelGateway({ instanceId: "instance-1", nodeInstanceId: (split!.state as WorkflowRuntimeNodeRecord).nodeInstanceId, commandId: "complete-split", actor, correlationId: "correlation-1", occurredAt });

    const left = await engine.claimNext({ instanceId: "instance-1", commandId: "claim-left", workerId: "worker-1", leaseDurationMs: 60_000, correlationId: "correlation-1", occurredAt });
    await engine.execute(succeed(left!.state as WorkflowRuntimeNodeRecord, "complete-left"));
    expect([...store.nodes.values()].find((node) => node.nodeKey === "join")?.status).toBe("waiting");

    const right = await engine.claimNext({ instanceId: "instance-1", commandId: "claim-right", workerId: "worker-1", leaseDurationMs: 60_000, correlationId: "correlation-1", occurredAt });
    await engine.execute(succeed(right!.state as WorkflowRuntimeNodeRecord, "complete-right"));
    const join = [...store.nodes.values()].find((node) => node.nodeKey === "join")!;
    expect(join.status).toBe("ready");

    await engine.executeParallelGateway({ instanceId: "instance-1", nodeInstanceId: join.nodeInstanceId, commandId: "complete-join", actor, correlationId: "correlation-1", occurredAt });
    expect([...store.nodes.values()].filter((node) => node.nodeKey === "end")).toHaveLength(1);
  });

  it("rejects drafts, invalid start graphs and scope widening", async () => {
    await expect(new WorkflowRuntimeEngine(new MemoryRuntimeStore(null)).start({
      workflowVersionId: "draft", idempotencyKey: "start", correlationId: "c", actor, occurredAt,
    })).rejects.toBeInstanceOf(WorkflowRuntimeEngineError);

    const noStart = new MemoryRuntimeStore({ ...graph, nodes: graph.nodes.filter((node) => node.blockType !== "manual_start") });
    await expect(new WorkflowRuntimeEngine(noStart).start({
      workflowVersionId: "version-1", idempotencyKey: "start", correlationId: "c", actor, occurredAt,
    })).rejects.toMatchObject({ code: "invalid_graph" });

    await expect(new WorkflowRuntimeEngine(new MemoryRuntimeStore()).start({
      workflowVersionId: "version-1", idempotencyKey: "start", correlationId: "c", actor, occurredAt, clientIds: ["other-client"],
    })).rejects.toMatchObject({ code: "scope_mismatch" });
  });
});
