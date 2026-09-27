import { describe, expect, it } from "vitest";

import type {
  InsertNodeAttemptResult,
  InsertWorkflowInstance,
  InsertWorkflowNodeAttempt,
  InsertWorkflowTask,
  WorkflowEngineEvent,
  WorkflowRuntimeChangeIntentApplyUpdate,
  WorkflowRuntimeChangeIntentRecord,
  WorkflowRuntimeChangeIntentWrite,
  WorkflowRuntimeChangeIntentWriteResult,
  WorkflowRuntimeEdgeDefinition,
  WorkflowRuntimeGraph,
  WorkflowRuntimeInstanceRecord,
  WorkflowRuntimeNodeRecord,
  WorkflowRuntimeOutboxWriteResult,
  WorkflowRuntimeRoleBindingRecord,
  WorkflowRuntimeSnapshotRecord,
  WorkflowRuntimeSnapshotWrite,
  WorkflowRuntimeSnapshotWriteResult,
  WorkflowRuntimeStore,
  WorkflowRuntimeTransaction,
  WorkflowTaskMutation,
  WorkflowTaskRecord,
  WorkflowTaskStatus,
} from "@/lib/workflow-studio/runtime-engine";
import type { WorkflowOutboxEnqueueInput, WorkflowOutboxMessage } from "@/lib/workflow-studio/runtime-outbox";
import { WorkflowRuntimeTimerService, workflowTimerDueItemsForTask } from "@/lib/workflow-studio/runtime-timers";
import type { WorkflowVariableRecord, WorkflowVariableWrite, WorkflowVariableWriteResult } from "@/lib/workflow-studio/runtime-variables";

function clone<T>(value: T): T {
  return structuredClone(value);
}

const now = "2026-08-11T08:00:00.000Z";

function task(overrides: Partial<WorkflowTaskRecord> = {}): WorkflowTaskRecord {
  return {
    id: "task-1",
    instanceId: "instance-1",
    workflowVersionId: "version-1",
    nodeInstanceId: "node-1",
    roleBindingId: "binding-1",
    status: "open",
    title: "Controleer aanvraag",
    instructions: "Controleer de aanvraag.",
    assigneeGroup: "bcm:role:account_manager",
    idempotencyKey: "task-create",
    correlationId: "correlation-1",
    deadlineAt: "2026-08-09T10:00:00.000Z",
    createdAt: "2026-08-08T08:00:00.000Z",
    updatedAt: "2026-08-08T08:00:00.000Z",
    workflowRole: "checker",
    permissions: ["workflow:approve"],
    tenant: "tenant-a",
    businessUnit: "bu-a",
    clientIds: null,
    ...overrides,
  };
}

class TimerMemoryStore implements WorkflowRuntimeStore, WorkflowRuntimeTransaction {
  tasks = new Map<string, WorkflowTaskRecord>();
  outbox = new Map<string, WorkflowOutboxMessage>();
  events: WorkflowEngineEvent[] = [];

  async transaction<T>(work: (transaction: WorkflowRuntimeTransaction) => Promise<T>): Promise<T> {
    const snapshot = {
      tasks: clone([...this.tasks]),
      outbox: clone([...this.outbox]),
      events: clone(this.events),
    };
    try {
      return await work(this);
    } catch (error) {
      this.tasks = new Map(snapshot.tasks);
      this.outbox = new Map(snapshot.outbox);
      this.events = snapshot.events;
      throw error;
    }
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

  async listOverdueTasks(current: string) {
    return clone([...this.tasks.values()].filter((entry) => (
      ["open", "claimed"].includes(entry.status)
      && entry.deadlineAt
      && entry.deadlineAt <= current
    )));
  }

  async findInstanceByStartKey(): Promise<WorkflowRuntimeInstanceRecord | null> { throw new Error("not used"); }
  async loadPublishedGraph(): Promise<WorkflowRuntimeGraph | null> { throw new Error("not used"); }
  async insertInstance(_input: InsertWorkflowInstance): Promise<WorkflowRuntimeInstanceRecord | null> { throw new Error("not used"); }
  async lockInstance(): Promise<WorkflowRuntimeInstanceRecord | null> { throw new Error("not used"); }
  async updateInstance(): Promise<void> { throw new Error("not used"); }
  async loadNode(): Promise<WorkflowRuntimeNodeRecord | null> { throw new Error("not used"); }
  async updateNode(): Promise<void> { throw new Error("not used"); }
  async insertNodeAttempt(_input: InsertWorkflowNodeAttempt): Promise<InsertNodeAttemptResult> { throw new Error("not used"); }
  async listOutgoingEdges(): Promise<readonly WorkflowRuntimeEdgeDefinition[]> { throw new Error("not used"); }
  async listIncomingEdges(): Promise<readonly WorkflowRuntimeEdgeDefinition[]> { throw new Error("not used"); }
  async findRunnableNode(): Promise<WorkflowRuntimeNodeRecord | null> { throw new Error("not used"); }
  async listNodes(): Promise<readonly WorkflowRuntimeNodeRecord[]> { throw new Error("not used"); }
  async listVariables(): Promise<readonly WorkflowVariableRecord[]> { throw new Error("not used"); }
  async writeVariable(_input: WorkflowVariableWrite): Promise<WorkflowVariableWriteResult> { throw new Error("not used"); }
  async loadDataSnapshot(): Promise<WorkflowRuntimeSnapshotRecord | null> { throw new Error("not used"); }
  async writeDataSnapshot(_input: WorkflowRuntimeSnapshotWrite): Promise<WorkflowRuntimeSnapshotWriteResult> { throw new Error("not used"); }
  async writeChangeIntent(_input: WorkflowRuntimeChangeIntentWrite): Promise<WorkflowRuntimeChangeIntentWriteResult> { throw new Error("not used"); }
  async loadChangeIntent(): Promise<WorkflowRuntimeChangeIntentRecord | null> { throw new Error("not used"); }
  async updateChangeIntentApplyResult(_input: WorkflowRuntimeChangeIntentApplyUpdate): Promise<WorkflowRuntimeChangeIntentRecord> { throw new Error("not used"); }
  async findRoleBinding(): Promise<WorkflowRuntimeRoleBindingRecord | null> { throw new Error("not used"); }
  async writeTask(_input: InsertWorkflowTask): Promise<{ task: WorkflowTaskRecord; created: boolean }> { throw new Error("not used"); }
  async loadTask(): Promise<WorkflowTaskRecord | null> { throw new Error("not used"); }
  async updateTask(_input: WorkflowTaskMutation): Promise<WorkflowTaskRecord> { throw new Error("not used"); }
  async listTasksForGroups(_identityGroups: readonly string[], _statuses?: readonly WorkflowTaskStatus[]): Promise<readonly WorkflowTaskRecord[]> { throw new Error("not used"); }
}

describe("workflow runtime timers", () => {
  it("plans one reminder on the deadline day and escalations for missed calendar days", () => {
    expect(workflowTimerDueItemsForTask(task(), now, { escalationGroup: "bcm:role:operations" })).toEqual([
      expect.objectContaining({ dueDate: "2026-08-09", deliveryType: "deadline_reminder", escalationGroups: [], idempotencyKey: "timer:task-1:2026-08-09:deadline_reminder" }),
      expect.objectContaining({ dueDate: "2026-08-10", deliveryType: "deadline_escalation", escalationGroups: ["bcm:role:operations"] }),
      expect.objectContaining({ dueDate: "2026-08-11", deliveryType: "deadline_escalation", escalationGroups: ["bcm:role:operations"] }),
    ]);
  });

  it("queues overdue reminders and escalation notifications idempotently", async () => {
    const store = new TimerMemoryStore();
    store.tasks.set("task-1", task());
    const service = new WorkflowRuntimeTimerService(store, { escalationGroup: "bcm:role:operations" });

    const first = await service.processDueTasks({ now, workerId: "timer-worker", correlationId: "correlation-1" });
    const second = await service.processDueTasks({ now, workerId: "timer-worker", correlationId: "correlation-1" });

    expect(first).toMatchObject({ scannedTasks: 1, queued: 3, deduplicated: 0 });
    expect(second).toMatchObject({ scannedTasks: 1, queued: 0, deduplicated: 3 });
    expect([...store.outbox.values()]).toEqual([
      expect.objectContaining({ idempotencyKey: "timer:task-1:2026-08-09:deadline_reminder", payload: expect.objectContaining({ timerType: "deadline_reminder", recipients: [{ workflowRole: "checker", identityGroup: "bcm:role:account_manager" }] }) }),
      expect.objectContaining({ idempotencyKey: "timer:task-1:2026-08-10:deadline_escalation", payload: expect.objectContaining({ timerType: "deadline_escalation", recipients: expect.arrayContaining([{ workflowRole: "escalation", identityGroup: "bcm:role:operations" }]) }) }),
      expect.objectContaining({ idempotencyKey: "timer:task-1:2026-08-11:deadline_escalation" }),
    ]);
    expect(store.events).toHaveLength(3);
  });

  it("uses the original deadline calendar snapshot for delegation and escalation", async () => {
    const store = new TimerMemoryStore();
    store.tasks.set("task-1", task({ deadlineAt: "2026-08-10T10:00:00.000Z" }));
    store.events.push({
      id: "event-created",
      sequenceNumber: 1,
      instanceId: "instance-1",
      nodeInstanceId: "node-1",
      eventType: "workflow.task.created",
      eventVersion: 1,
      payload: {
        taskId: "task-1",
        deadlinePolicy: {
          startedAt: "2026-08-10T09:00:00.000Z",
          durationHours: 1,
          deadlineAt: "2026-08-10T10:00:00.000Z",
          calendar: {
            timezone: "UTC",
            workingDays: [1, 2, 3, 4, 5],
            businessHours: { start: "09:00", end: "17:00" },
            holidays: [],
            absences: [{
              identityGroup: "bcm:role:account_manager",
              from: "2026-08-11T00:00:00.000Z",
              until: "2026-08-12T00:00:00.000Z",
              delegateToGroup: "bcm:role:operations",
            }],
            stopClockPeriods: [],
            escalationLevels: [{ afterBusinessHours: 8, identityGroup: "bcm:role:teamlead" }],
          },
        },
      },
      actor: { type: "system", id: "worker" },
      idempotencyKey: "create-task:event",
      correlationId: "correlation-1",
      occurredAt: "2026-08-10T09:00:00.000Z",
    });

    const result = await new WorkflowRuntimeTimerService(store, { escalationGroup: "bcm:role:fallback" }).processDueTasks({
      now: "2026-08-11T11:00:00.000Z",
      workerId: "timer-worker",
      correlationId: "correlation-1",
    });

    expect(result.queued).toBe(2);
    expect([...store.outbox.values()].at(-1)?.payload).toMatchObject({
      timerType: "deadline_escalation",
      delegated: true,
      delegateGroups: ["bcm:role:operations"],
      escalationGroups: ["bcm:role:teamlead"],
      recipients: expect.arrayContaining([
        { workflowRole: "checker", identityGroup: "bcm:role:account_manager" },
        { workflowRole: "escalation", identityGroup: "bcm:role:operations" },
        { workflowRole: "escalation", identityGroup: "bcm:role:teamlead" },
      ]),
    });
  });

  it("ignores completed tasks and future deadlines", async () => {
    const store = new TimerMemoryStore();
    store.tasks.set("done", task({ id: "done", status: "completed", deadlineAt: "2026-08-09T10:00:00.000Z", claimedByUserId: "user-1", claimedAt: "2026-08-09T08:00:00.000Z", completedAt: "2026-08-09T09:00:00.000Z", outcome: "completed" }));
    store.tasks.set("future", task({ id: "future", deadlineAt: "2026-08-12T10:00:00.000Z" }));

    const result = await new WorkflowRuntimeTimerService(store).processDueTasks({ now, workerId: "timer-worker", correlationId: "correlation-1" });

    expect(result).toMatchObject({ scannedTasks: 0, queued: 0, deduplicated: 0 });
    expect(store.outbox.size).toBe(0);
  });
});
