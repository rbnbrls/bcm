import { describe, expect, it } from "vitest";

import type { IdentityContext } from "@/lib/identity/types";
import {
  WorkflowRuntimeEngine,
  type InsertNodeAttemptResult,
  type InsertWorkflowInstance,
  type InsertWorkflowNodeAttempt,
  type InsertWorkflowTask,
  type WorkflowEngineEvent,
  type WorkflowRuntimeEdgeDefinition,
  type WorkflowRuntimeGraph,
  type WorkflowRuntimeInstanceRecord,
  type WorkflowRuntimeChangeIntentWrite,
  type WorkflowRuntimeChangeIntentWriteResult,
  type WorkflowRuntimeChangeIntentApplyUpdate,
  type WorkflowRuntimeChangeIntentRecord,
  type WorkflowRuntimeOutboxWriteResult,
  type WorkflowRuntimeNodeRecord,
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
} from "@/lib/workflow-studio";
import type { WorkflowOutboxEnqueueInput } from "@/lib/workflow-studio/runtime-outbox";
import { WorkflowTaskService } from "@/lib/workflow-studio/runtime-task";

function clone<T>(value: T): T {
  return structuredClone(value);
}

const identity = (overrides: Partial<IdentityContext> = {}): IdentityContext => ({
  userId: "user-1",
  displayName: "User One",
  groups: ["bcm:role:change_manager"],
  tenant: "tenant-a",
  businessUnit: "bu-a",
  sessionId: "session-1",
  ...overrides,
});

const graph: WorkflowRuntimeGraph = {
  workflowVersionId: "version-1",
  definitionStatus: "published",
  tenant: "tenant-a",
  businessUnit: "bu-a",
  clientIds: null,
  nodes: [
    {
      id: "node-task",
      workflowVersionId: "version-1",
      nodeKey: "task",
      blockType: "role_task",
      configuration: {
        roleId: "processor",
        title: "Controleer aanvraag",
        instructions: "Vul het resultaat in.",
        inputVariables: [],
        outputVariables: ["resultaat"],
      },
    },
    {
      id: "node-approval",
      workflowVersionId: "version-1",
      nodeKey: "approval-step",
      blockType: "approval",
      configuration: {
        roleId: "checker",
        title: "Goedkeuringsbesluit",
        instructions: "Controleer de aanvraag.",
        inputVariables: [],
        decisionLabels: { approved: "Akkoord", rejected: "Afwijzen", returned: "Terugsturen" },
        requireCommentOnApprove: false,
        requireCommentOnReject: true,
        requireCommentOnReturn: true,
      },
    },
  ],
  edges: [],
};

function instance(): WorkflowRuntimeInstanceRecord {
  return {
    kind: "instance",
    instanceId: "instance-1",
    workflowVersionId: "version-1",
    tenant: "tenant-a",
    businessUnit: "bu-a",
    clientIds: null,
    status: "running",
    idempotencyKey: "start-1",
    correlationId: "correlation-1",
    startedByUserId: "starter-1",
    input: {},
    startedAt: "2026-08-11T08:00:00.000Z",
  };
}

function node(overrides: Partial<WorkflowRuntimeNodeRecord> = {}): WorkflowRuntimeNodeRecord {
  return {
    kind: "node",
    instanceId: "instance-1",
    nodeInstanceId: "node-instance-1",
    workflowVersionId: "version-1",
    workflowNodeId: "node-task",
    nodeKey: "task",
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

function task(overrides: Partial<WorkflowTaskRecord> = {}): WorkflowTaskRecord {
  return {
    id: "task-1",
    instanceId: "instance-1",
    workflowVersionId: "version-1",
    nodeInstanceId: "node-instance-1",
    roleBindingId: "binding-1",
    status: "open",
    title: "Controleer aanvraag",
    instructions: "Vul het resultaat in.",
    assigneeGroup: "bcm:role:change_manager",
    idempotencyKey: "task-1",
    correlationId: "correlation-1",
    createdAt: "2026-08-11T08:01:00.000Z",
    updatedAt: "2026-08-11T08:01:00.000Z",
    workflowRole: "processor",
    permissions: ["workflow:tasks:execute"],
    tenant: "tenant-a",
    businessUnit: "bu-a",
    clientIds: null,
    ...overrides,
  };
}

class TaskMemoryStore implements WorkflowRuntimeStore, WorkflowRuntimeTransaction {
  graph: WorkflowRuntimeGraph = graph;
  instances = new Map([["instance-1", instance()]]);
  nodes = new Map([["node-instance-1", node()]]);
  tasks = new Map<string, WorkflowTaskRecord>();
  variables = new Map<string, WorkflowVariableRecord>();
  events: WorkflowEngineEvent[] = [];

  async transaction<T>(work: (transaction: WorkflowRuntimeTransaction) => Promise<T>): Promise<T> {
    return work(this);
  }

  async findInstanceByStartKey(): Promise<WorkflowRuntimeInstanceRecord | null> { return null; }
  async loadPublishedGraph(workflowVersionId: string) { return workflowVersionId === this.graph.workflowVersionId ? clone(this.graph) : null; }
  async insertInstance(_input: InsertWorkflowInstance): Promise<WorkflowRuntimeInstanceRecord | null> { return null; }
  async lockInstance(instanceId: string) { return clone(this.instances.get(instanceId) ?? null); }
  async updateInstance(state: WorkflowRuntimeInstanceRecord) { this.instances.set(state.instanceId, clone(state)); }
  async loadNode(nodeInstanceId: string) { return clone(this.nodes.get(nodeInstanceId) ?? null); }
  async updateNode(state: WorkflowRuntimeNodeRecord) { this.nodes.set(state.nodeInstanceId, clone(state)); }
  async insertNodeAttempt(_input: InsertWorkflowNodeAttempt): Promise<InsertNodeAttemptResult> { throw new Error("not used"); }
  async findCommandEvent(instanceId: string, idempotencyKey: string) {
    return clone(this.events.find((event) => event.instanceId === instanceId && event.idempotencyKey === idempotencyKey) ?? null);
  }
  async appendEvent(event: WorkflowEngineEvent) {
    const stored = { ...clone(event), id: `event-${this.events.length + 1}`, sequenceNumber: this.events.length + 1 };
    this.events.push(stored);
    return clone(stored);
  }
  async listEvents(instanceId: string) { return clone(this.events.filter((event) => event.instanceId === instanceId)); }
  async listOutgoingEdges(_workflowVersionId: string, _sourceNodeId: string, _sourcePort: string): Promise<readonly WorkflowRuntimeEdgeDefinition[]> { return []; }
  async listIncomingEdges(): Promise<readonly WorkflowRuntimeEdgeDefinition[]> { return []; }
  async findRunnableNode(): Promise<WorkflowRuntimeNodeRecord | null> { return null; }
  async listNodes(instanceId: string) { return clone([...this.nodes.values()].filter((item) => item.instanceId === instanceId)); }
  async listVariables(instanceId: string) { return clone([...this.variables.values()].filter((item) => item.instanceId === instanceId)); }
  async writeVariable(input: WorkflowVariableWrite) {
    const variable: WorkflowVariableRecord = {
      id: input.id,
      instanceId: input.instanceId,
      sourceNodeInstanceId: input.sourceNodeInstanceId,
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
  async writeDataSnapshot(_input: WorkflowRuntimeSnapshotWrite): Promise<WorkflowRuntimeSnapshotWriteResult> { throw new Error("not used"); }
  async loadDataSnapshot(_instanceId: string, _snapshotId: string): Promise<WorkflowRuntimeSnapshotRecord | null> { return null; }
  async writeChangeIntent(_input: WorkflowRuntimeChangeIntentWrite): Promise<WorkflowRuntimeChangeIntentWriteResult> { throw new Error("not used"); }
  async loadChangeIntent(_instanceId: string, _intentId: string): Promise<WorkflowRuntimeChangeIntentRecord | null> { return null; }
  async updateChangeIntentApplyResult(_input: WorkflowRuntimeChangeIntentApplyUpdate): Promise<WorkflowRuntimeChangeIntentRecord> { throw new Error("not used"); }
  async enqueueOutbox(_input: WorkflowOutboxEnqueueInput): Promise<WorkflowRuntimeOutboxWriteResult> { throw new Error("not used"); }
  async findRoleBinding(_workflowVersionId: string, workflowRole: string, permission: string): Promise<WorkflowRuntimeRoleBindingRecord | null> {
    return {
      id: "binding-1",
      workflowVersionId: "version-1",
      workflowRole,
      identityGroup: permission === "workflow:approve" ? "bcm:role:account_manager" : "bcm:role:change_manager",
      permissions: [permission],
      tenant: "tenant-a",
      businessUnit: "bu-a",
      clientIds: null,
    };
  }
  async writeTask(input: InsertWorkflowTask) {
    const existing = [...this.tasks.values()].find((item) => item.instanceId === input.instanceId && item.idempotencyKey === input.idempotencyKey);
    if (existing) return { task: clone(existing), created: false };
    const created = task({
      id: input.id,
      instanceId: input.instanceId,
      workflowVersionId: input.workflowVersionId,
      nodeInstanceId: input.nodeInstanceId,
      roleBindingId: input.roleBindingId,
      title: input.title,
      instructions: input.instructions,
      assigneeGroup: input.assigneeGroup,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      causationId: input.causationId,
      deadlineAt: input.deadlineAt,
      workflowRole: input.assigneeGroup === "bcm:role:account_manager" ? "checker" : "processor",
      permissions: input.assigneeGroup === "bcm:role:account_manager" ? ["workflow:approve"] : ["workflow:tasks:execute"],
    });
    this.tasks.set(created.id, created);
    return { task: clone(created), created: true };
  }
  async loadTask(taskId: string) { return clone(this.tasks.get(taskId) ?? null); }
  async updateTask(input: WorkflowTaskMutation) {
    const current = this.tasks.get(input.taskId);
    if (!current) throw new Error("Task not found");
    const updated: WorkflowTaskRecord = {
      ...current,
      status: input.status,
      claimedByUserId: input.claimedByUserId,
      outcome: input.outcome,
      formData: input.formData,
      completionComment: input.completionComment,
      claimedAt: input.claimedAt,
      completedAt: input.completedAt,
      updatedAt: input.completedAt ?? input.claimedAt ?? current.updatedAt,
    };
    this.tasks.set(updated.id, updated);
    return clone(updated);
  }
  async listTasksForGroups(identityGroups: readonly string[], statuses: readonly WorkflowTaskStatus[]) {
    return clone([...this.tasks.values()].filter((item) => identityGroups.includes(item.assigneeGroup) && statuses.includes(item.status)));
  }
  async listOverdueTasks(now: string) {
    return clone([...this.tasks.values()].filter((item) => ["open", "claimed"].includes(item.status) && item.deadlineAt && item.deadlineAt <= now));
  }
}

describe("workflow role tasks", () => {
  it("lists only tasks for authorized role members inside scope", async () => {
    const store = new TaskMemoryStore();
    store.tasks.set("task-1", task());
    store.tasks.set("task-2", task({ id: "task-2", assigneeGroup: "bcm:role:account_manager" }));

    const result = await new WorkflowTaskService(store).listMine(identity());

    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.value.map((item) => item.id)).toEqual(["task-1"]);
  });

  it("claims an open task with actor and timestamp", async () => {
    const store = new TaskMemoryStore();
    store.tasks.set("task-1", task());

    const result = await new WorkflowTaskService(store).claim(identity(), {
      taskId: "task-1",
      occurredAt: "2026-08-11T09:00:00.000Z",
    });

    expect(result).toMatchObject({ ok: true, value: { status: "claimed", claimedByUserId: "user-1", claimedAt: "2026-08-11T09:00:00.000Z" } });
  });

  it("rejects completion by a different user than the claim holder", async () => {
    const store = new TaskMemoryStore();
    store.tasks.set("task-1", task({ status: "claimed", claimedByUserId: "user-2", claimedAt: "2026-08-11T09:00:00.000Z" }));

    const result = await new WorkflowTaskService(store).complete(identity(), {
      taskId: "task-1",
      commandId: "complete-1",
      correlationId: "correlation-1",
      occurredAt: "2026-08-11T10:00:00.000Z",
      formData: { resultaat: "akkoord" },
    });

    expect(result).toMatchObject({ ok: false, code: "task_not_completable" });
    expect(store.nodes.get("node-instance-1")?.status).toBe("running");
  });

  it("completes a claimed task, succeeds the node and writes output variables", async () => {
    const store = new TaskMemoryStore();
    store.tasks.set("task-1", task({ status: "claimed", claimedByUserId: "user-1", claimedAt: "2026-08-11T09:00:00.000Z" }));

    const result = await new WorkflowTaskService(store).complete(identity(), {
      taskId: "task-1",
      commandId: "complete-1",
      correlationId: "correlation-1",
      occurredAt: "2026-08-11T10:00:00.000Z",
      formData: { resultaat: "akkoord" },
      comment: "Ziet er goed uit.",
    });

    expect(result).toMatchObject({ ok: true, value: { status: "completed", outcome: "completed", completionComment: "Ziet er goed uit." } });
    expect(store.nodes.get("node-instance-1")?.status).toBe("succeeded");
    expect([...store.variables.values()]).toMatchObject([{ name: "resultaat", value: "akkoord", classification: "confidential" }]);
    expect(store.events.map((event) => event.eventType)).toEqual(["workflow.node.succeeded", "workflow.task.completed"]);
  });

  it("materializes role task deadlines from a reproducible business calendar snapshot", async () => {
    const store = new TaskMemoryStore();
    store.graph = {
      ...graph,
      nodes: [{
        ...graph.nodes[0]!,
        configuration: {
          roleId: "processor",
          title: "Controleer aanvraag",
          instructions: "Vul het resultaat in.",
          inputVariables: [],
          outputVariables: ["resultaat"],
          deadlineHours: 6,
          deadlineCalendar: {
            timezone: "UTC",
            workingDays: [1, 2, 3, 4, 5],
            businessHours: { start: "09:00", end: "17:00" },
            holidays: ["2026-08-12"],
            absences: [],
            stopClockPeriods: [{ from: "2026-08-11T12:00:00.000Z", until: "2026-08-11T14:00:00.000Z", reason: "Extern akkoord" }],
            escalationLevels: [{ afterBusinessHours: 4, identityGroup: "bcm:role:operations" }],
          },
        },
      }, graph.nodes[1]!],
    };
    store.nodes.set("node-instance-1", node({ status: "running" }));

    const result = await new WorkflowRuntimeEngine(store).createRoleTask({
      instanceId: "instance-1",
      nodeInstanceId: "node-instance-1",
      commandId: "create-task-1",
      actor: { type: "system", id: "worker-1" },
      correlationId: "correlation-1",
      occurredAt: "2026-08-11T10:00:00.000Z",
    });

    expect(result).toMatchObject({ created: true, task: { deadlineAt: "2026-08-13T10:00:00.000Z" } });
    expect(store.events.at(-1)?.payload).toMatchObject({
      taskId: result.task.id,
      deadlinePolicy: {
        startedAt: "2026-08-11T10:00:00.000Z",
        durationHours: 6,
        deadlineAt: "2026-08-13T10:00:00.000Z",
        calendar: expect.objectContaining({ holidays: ["2026-08-12"] }),
      },
    });
  });

  it("materializes approval tasks against an approval role binding", async () => {
    const store = new TaskMemoryStore();
    store.nodes.set("approval-node-instance", node({
      nodeInstanceId: "approval-node-instance",
      workflowNodeId: "node-approval",
      nodeKey: "approval-step",
      blockType: "approval",
    }));

    const result = await new WorkflowRuntimeEngine(store).createApprovalTask({
      instanceId: "instance-1",
      nodeInstanceId: "approval-node-instance",
      commandId: "create-approval-1",
      actor: { type: "system", id: "worker-1" },
      correlationId: "correlation-1",
      occurredAt: "2026-08-11T09:00:00.000Z",
    });

    expect(result).toMatchObject({
      created: true,
      task: {
        title: "Goedkeuringsbesluit",
        assigneeGroup: "bcm:role:account_manager",
        workflowRole: "checker",
        permissions: ["workflow:approve"],
      },
    });
    expect(store.events.map((event) => event.eventType)).toEqual(["workflow.approval.created"]);
  });

  it("blocks requester self-approval even through the service path", async () => {
    const store = new TaskMemoryStore();
    store.nodes.set("approval-node-instance", node({
      nodeInstanceId: "approval-node-instance",
      workflowNodeId: "node-approval",
      nodeKey: "approval-step",
      blockType: "approval",
    }));
    store.tasks.set("approval-task", task({
      id: "approval-task",
      nodeInstanceId: "approval-node-instance",
      assigneeGroup: "bcm:role:account_manager",
      workflowRole: "checker",
      permissions: ["workflow:approve"],
      status: "claimed",
      claimedByUserId: "starter-1",
      claimedAt: "2026-08-11T09:00:00.000Z",
    }));

    const result = await new WorkflowTaskService(store).decideApproval(identity({
      userId: "starter-1",
      groups: ["bcm:role:account_manager"],
    }), {
      taskId: "approval-task",
      commandId: "approve-1",
      correlationId: "correlation-1",
      occurredAt: "2026-08-11T10:00:00.000Z",
      decision: "approved",
    });

    expect(result).toMatchObject({ ok: false, code: "maker_checker_conflict" });
    expect(store.nodes.get("approval-node-instance")?.status).toBe("running");
  });

  it("denies claim and approve/reject to the unauthorized viewer identity", async () => {
    // t_14be6701: the viewer profile has zero permissions, so the task
    // service must refuse it at every step — claiming the approval task,
    // approving it and rejecting it all return permission_denied.
    const store = new TaskMemoryStore();
    store.nodes.set("approval-node-instance", node({
      nodeInstanceId: "approval-node-instance",
      workflowNodeId: "node-approval",
      nodeKey: "approval-step",
      blockType: "approval",
    }));
    store.tasks.set("approval-task", task({
      id: "approval-task",
      nodeInstanceId: "approval-node-instance",
      assigneeGroup: "bcm:role:account_manager",
      workflowRole: "checker",
      permissions: ["workflow:approve"],
    }));

    const service = new WorkflowTaskService(store);
    const viewer = identity({ userId: "viewer-1", groups: ["bcm:role:viewer"] });

    const claimResult = await service.claim(viewer, { taskId: "approval-task", occurredAt: "2026-08-11T10:00:00.000Z" });
    expect(claimResult).toMatchObject({ ok: false, code: "permission_denied" });

    const approveResult = await service.decideApproval(viewer, {
      taskId: "approval-task",
      commandId: "approve-1",
      correlationId: "correlation-1",
      occurredAt: "2026-08-11T10:00:00.000Z",
      decision: "approved",
      comment: "Niet geautoriseerd.",
    });
    expect(approveResult).toMatchObject({ ok: false, code: "permission_denied" });

    const rejectResult = await service.decideApproval(viewer, {
      taskId: "approval-task",
      commandId: "reject-1",
      correlationId: "correlation-1",
      occurredAt: "2026-08-11T10:00:00.000Z",
      decision: "rejected",
      comment: "Niet geautoriseerd.",
    });
    expect(rejectResult).toMatchObject({ ok: false, code: "permission_denied" });

    expect(store.tasks.get("approval-task")?.status).toBe("open");
  });

  it("denies claim and approve/reject to the change manager on approval tasks", async () => {
    // t_a706ed74: the change manager profile can create benchmark change
    // requests (workflow:start) but must NOT be able to approve or reject
    // them. The approval task is bound to bcm:role:account_manager with
    // workflow:approve, so the change manager (workflow:start only) is
    // denied at every step.
    const store = new TaskMemoryStore();
    store.nodes.set("approval-node-instance", node({
      nodeInstanceId: "approval-node-instance",
      workflowNodeId: "node-approval",
      nodeKey: "approval-step",
      blockType: "approval",
    }));
    store.tasks.set("approval-task", task({
      id: "approval-task",
      nodeInstanceId: "approval-node-instance",
      assigneeGroup: "bcm:role:account_manager",
      workflowRole: "checker",
      permissions: ["workflow:approve"],
    }));

    const service = new WorkflowTaskService(store);
    const changeManager = identity({
      userId: "change-manager-1",
      groups: ["bcm:role:change_manager"],
    });

    const claimResult = await service.claim(changeManager, { taskId: "approval-task", occurredAt: "2026-08-11T10:00:00.000Z" });
    expect(claimResult).toMatchObject({ ok: false, code: "permission_denied" });

    const approveResult = await service.decideApproval(changeManager, {
      taskId: "approval-task",
      commandId: "approve-1",
      correlationId: "correlation-1",
      occurredAt: "2026-08-11T10:00:00.000Z",
      decision: "approved",
      comment: "Geen mandaat.",
    });
    expect(approveResult).toMatchObject({ ok: false, code: "permission_denied" });

    const rejectResult = await service.decideApproval(changeManager, {
      taskId: "approval-task",
      commandId: "reject-1",
      correlationId: "correlation-1",
      occurredAt: "2026-08-11T10:00:00.000Z",
      decision: "rejected",
      comment: "Geen mandaat.",
    });
    expect(rejectResult).toMatchObject({ ok: false, code: "permission_denied" });

    expect(store.tasks.get("approval-task")?.status).toBe("open");
  });

  it("allows the account manager to claim and approve approval tasks", async () => {
    // t_f7413517: the account manager profile is the dedicated approver for
    // benchmark change requests. The approval task is bound to
    // bcm:role:account_manager with workflow:approve, so the account manager
    // must be able to claim it and decide it (approved here; rejected in the
    // next test), while a change_manager identity stays denied (control).
    const store = new TaskMemoryStore();
    store.nodes.set("approval-node-instance", node({
      nodeInstanceId: "approval-node-instance",
      workflowNodeId: "node-approval",
      nodeKey: "approval-step",
      blockType: "approval",
    }));
    store.tasks.set("approval-task", task({
      id: "approval-task",
      nodeInstanceId: "approval-node-instance",
      assigneeGroup: "bcm:role:account_manager",
      workflowRole: "checker",
      permissions: ["workflow:approve"],
    }));

    const service = new WorkflowTaskService(store);
    const accountManager = identity({
      userId: "account-manager-1",
      groups: ["bcm:role:account_manager"],
    });

    const claimResult = await service.claim(accountManager, { taskId: "approval-task", occurredAt: "2026-08-11T10:00:00.000Z" });
    expect(claimResult).toMatchObject({ ok: true, value: { status: "claimed", claimedByUserId: "account-manager-1" } });

    const approveResult = await service.decideApproval(accountManager, {
      taskId: "approval-task",
      commandId: "approve-1",
      correlationId: "correlation-1",
      occurredAt: "2026-08-11T10:05:00.000Z",
      decision: "approved",
      comment: "Akkoord.",
    });
    expect(approveResult).toMatchObject({ ok: true, value: { status: "completed", outcome: "approved" } });
  });

  it("allows the account manager to reject an approval task", async () => {
    // t_f7413517 (reject path): same account_manager identity must be able
    // to decide "rejected" on an approval task (with the required comment).
    const store = new TaskMemoryStore();
    store.nodes.set("approval-node-instance", node({
      nodeInstanceId: "approval-node-instance",
      workflowNodeId: "node-approval",
      nodeKey: "approval-step",
      blockType: "approval",
    }));
    store.tasks.set("approval-task", task({
      id: "approval-task",
      nodeInstanceId: "approval-node-instance",
      assigneeGroup: "bcm:role:account_manager",
      workflowRole: "checker",
      permissions: ["workflow:approve"],
      status: "claimed",
      claimedByUserId: "account-manager-1",
      claimedAt: "2026-08-11T10:00:00.000Z",
    }));

    const result = await new WorkflowTaskService(store).decideApproval(identity({
      userId: "account-manager-1",
      groups: ["bcm:role:account_manager"],
    }), {
      taskId: "approval-task",
      commandId: "reject-1",
      correlationId: "correlation-1",
      occurredAt: "2026-08-11T10:05:00.000Z",
      decision: "rejected",
      comment: "Afgekeurd.",
    });

    expect(result).toMatchObject({ ok: true, value: { status: "completed", outcome: "rejected" } });
  });

  it("enforces comment policy for rejection and return decisions", async () => {
    const store = new TaskMemoryStore();
    store.nodes.set("approval-node-instance", node({
      nodeInstanceId: "approval-node-instance",
      workflowNodeId: "node-approval",
      nodeKey: "approval-step",
      blockType: "approval",
    }));
    store.tasks.set("approval-task", task({
      id: "approval-task",
      nodeInstanceId: "approval-node-instance",
      assigneeGroup: "bcm:role:account_manager",
      workflowRole: "checker",
      permissions: ["workflow:approve"],
      status: "claimed",
      claimedByUserId: "approver-1",
      claimedAt: "2026-08-11T09:00:00.000Z",
    }));

    const result = await new WorkflowTaskService(store).decideApproval(identity({
      userId: "approver-1",
      groups: ["bcm:role:account_manager"],
    }), {
      taskId: "approval-task",
      commandId: "reject-1",
      correlationId: "correlation-1",
      occurredAt: "2026-08-11T10:00:00.000Z",
      decision: "rejected",
    });

    expect(result).toMatchObject({ ok: false, code: "comment_required" });
    expect(store.tasks.get("approval-task")?.status).toBe("claimed");
  });

  it("records approval decisions, succeeds the node and audits the actor", async () => {
    const store = new TaskMemoryStore();
    store.nodes.set("approval-node-instance", node({
      nodeInstanceId: "approval-node-instance",
      workflowNodeId: "node-approval",
      nodeKey: "approval-step",
      blockType: "approval",
    }));
    store.tasks.set("approval-task", task({
      id: "approval-task",
      nodeInstanceId: "approval-node-instance",
      assigneeGroup: "bcm:role:account_manager",
      workflowRole: "checker",
      permissions: ["workflow:approve"],
      status: "claimed",
      claimedByUserId: "approver-1",
      claimedAt: "2026-08-11T09:00:00.000Z",
    }));

    const result = await new WorkflowTaskService(store).decideApproval(identity({
      userId: "approver-1",
      groups: ["bcm:role:account_manager"],
    }), {
      taskId: "approval-task",
      commandId: "approve-1",
      correlationId: "correlation-1",
      occurredAt: "2026-08-11T10:00:00.000Z",
      decision: "approved",
    });

    expect(result).toMatchObject({ ok: true, value: { status: "completed", outcome: "approved" } });
    expect(store.nodes.get("approval-node-instance")?.status).toBe("succeeded");
    expect([...store.variables.values()]).toMatchObject([{ name: "approval_step_decision", value: "approved" }]);
    expect(store.events.map((event) => event.eventType)).toEqual(["workflow.node.succeeded", "workflow.approval.decided"]);
    expect(store.events.at(-1)?.payload).toMatchObject({ decision: "approved", decidedByUserId: "approver-1" });
  });

  it("audits deterministic grouped approval decisions", async () => {
    const store = new TaskMemoryStore();
    store.graph = {
      ...graph,
      nodes: [
        graph.nodes[0]!,
        {
          ...graph.nodes[1],
          configuration: {
            ...graph.nodes[1]!.configuration,
            approvalGroupId: "risk_gate",
            approvalMode: "all_of",
            roleCombination: "distinct_roles",
          },
        },
        {
          id: "node-approval-final",
          workflowVersionId: "version-1",
          nodeKey: "approval-final",
          blockType: "approval",
          configuration: {
            roleId: "senior_checker",
            title: "Tweede goedkeuring",
            approvalGroupId: "risk_gate",
            approvalMode: "all_of",
            roleCombination: "distinct_roles",
          },
        },
      ],
    };
    store.nodes.set("approval-final-instance", node({
      nodeInstanceId: "approval-final-instance",
      workflowNodeId: "node-approval-final",
      nodeKey: "approval-final",
      blockType: "approval",
    }));
    store.tasks.set("approval-task-final", task({
      id: "approval-task-final",
      nodeInstanceId: "approval-final-instance",
      assigneeGroup: "bcm:role:account_manager",
      workflowRole: "senior_checker",
      permissions: ["workflow:approve"],
      status: "claimed",
      claimedByUserId: "approver-2",
      claimedAt: "2026-08-11T09:00:00.000Z",
    }));
    store.events.push({
      id: "event-existing",
      sequenceNumber: 1,
      instanceId: "instance-1",
      nodeInstanceId: "approval-node-instance",
      eventType: "workflow.approval.decided",
      eventVersion: 1,
      payload: {
        taskId: "approval-task",
        nodeKey: "approval-step",
        workflowRole: "checker",
        decision: "approved",
        decidedByUserId: "approver-1",
        commentRequired: false,
      },
      actor: { type: "user", id: "approver-1" },
      idempotencyKey: "approve-existing",
      correlationId: "correlation-1",
      occurredAt: "2026-08-11T09:30:00.000Z",
    });

    const result = await new WorkflowTaskService(store).decideApproval(identity({
      userId: "approver-2",
      groups: ["bcm:role:account_manager"],
    }), {
      taskId: "approval-task-final",
      commandId: "approve-final",
      correlationId: "correlation-1",
      occurredAt: "2026-08-11T10:00:00.000Z",
      decision: "approved",
    });

    expect(result).toMatchObject({ ok: true, value: { status: "completed", outcome: "approved" } });
    const policyEvent = store.events.find((event) => event.eventType === "workflow.approval.policy_evaluated");
    expect(policyEvent?.payload).toMatchObject({
      approvalGroupId: "risk_gate",
      mode: "all_of",
      status: "approved",
      requiredCount: 2,
      decidedCount: 2,
      approvedCount: 2,
      pendingNodeKeys: [],
      triggeringTaskId: "approval-task-final",
    });
  });
});
