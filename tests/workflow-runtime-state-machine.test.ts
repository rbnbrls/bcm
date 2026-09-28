import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKFLOW_RETRY_POLICY,
  TERMINAL_WORKFLOW_INSTANCE_STATUSES,
  TERMINAL_WORKFLOW_NODE_STATUSES,
  WORKFLOW_RUNTIME_COMMAND_TYPES,
  WORKFLOW_RUNTIME_TRANSITION_RULES,
  WorkflowRuntimeTransitionError,
  handleWorkflowRuntimeCommand,
  retryDelayMs,
  workflowInstanceLockKey,
  type WorkflowInstanceState,
  type WorkflowNodeState,
  type WorkflowRuntimeCommand,
  type WorkflowRuntimeState,
} from "@/lib/workflow-studio/runtime-state-machine";

const actor = { type: "system", id: "workflow-engine" } as const;

type DefaultCommandKeys = "commandId" | "instanceId" | "actor" | "correlationId" | "occurredAt";
type RuntimeCommandInput = {
  [TType in WorkflowRuntimeCommand["type"]]: Omit<Extract<WorkflowRuntimeCommand, { type: TType }>, DefaultCommandKeys>
    & Partial<Pick<Extract<WorkflowRuntimeCommand, { type: TType }>, DefaultCommandKeys>>
}[WorkflowRuntimeCommand["type"]];

function command(value: RuntimeCommandInput): WorkflowRuntimeCommand {
  return {
    commandId: `command-${value.type}`,
    instanceId: "instance-1",
    actor,
    correlationId: "correlation-1",
    occurredAt: "2026-08-10T10:00:00.000Z",
    ...value,
  } as WorkflowRuntimeCommand;
}

function instance(status: WorkflowInstanceState["status"]): WorkflowInstanceState {
  return {
    kind: "instance",
    instanceId: "instance-1",
    status,
    ...(status === "pending" ? {} : { startedAt: "2026-08-10T09:00:00.000Z" }),
    ...(["completed", "cancelled", "failed"].includes(status) ? { completedAt: "2026-08-10T09:30:00.000Z" } : {}),
  };
}

function node(status: WorkflowNodeState["status"], overrides: Partial<WorkflowNodeState> = {}): WorkflowNodeState {
  return {
    kind: "node",
    instanceId: "instance-1",
    nodeInstanceId: "node-attempt-1",
    status,
    executionKind: "automated",
    attempt: 1,
    maxAttempts: 3,
    availableAt: "2026-08-10T09:00:00.000Z",
    ...(status === "ready" ? {} : { startedAt: "2026-08-10T09:05:00.000Z" }),
    ...(["succeeded", "skipped", "failed"].includes(status) ? { completedAt: "2026-08-10T09:30:00.000Z" } : {}),
    ...overrides,
  };
}

function run(state: WorkflowRuntimeState, value: WorkflowRuntimeCommand) {
  return handleWorkflowRuntimeCommand(state, value);
}

describe("workflow runtime state machine", () => {
  it("runs the normal instance lifecycle and emits exactly one auditable event per command", () => {
    const started = run(instance("pending"), command({ type: "start_instance", expectedStatus: "pending" }));
    expect(started.state).toMatchObject({ status: "running", startedAt: "2026-08-10T10:00:00.000Z" });
    expect(started.event).toMatchObject({
      eventType: "workflow.instance.started",
      commandType: "start_instance",
      fromStatus: "pending",
      toStatus: "running",
      actor,
      idempotencyKey: "command-start_instance",
      correlationId: "correlation-1",
    });
    expect(started.lockKey).toBe("workflow-instance:instance-1");

    const waiting = run(started.state, command({ type: "wait_instance", expectedStatus: "running" }));
    const resumed = run(waiting.state, command({ type: "resume_instance", expectedStatus: "waiting" }));
    const completed = run(resumed.state, command({ type: "complete_instance", expectedStatus: "running", result: { outcome: "accepted" } }));

    expect([started, waiting, resumed, completed].map(({ event }) => event.eventType)).toEqual([
      "workflow.instance.started",
      "workflow.instance.waiting",
      "workflow.instance.resumed",
      "workflow.instance.completed",
    ]);
    expect(completed.state).toMatchObject({ status: "completed", result: { outcome: "accepted" }, completedAt: "2026-08-10T10:00:00.000Z" });
    expect(completed.event.payload).toEqual({ result: { outcome: "accepted" } });
  });

  it("defines cancellation, terminal failure and recoverable intervention as distinct outcomes", () => {
    const cancelled = run(instance("pending"), command({ type: "cancel_instance", expectedStatus: "pending", reason: "Aanvrager trok in" }));
    expect(cancelled.state.status).toBe("cancelled");
    expect(cancelled.event).toMatchObject({ eventType: "workflow.instance.cancelled", payload: { reason: "Aanvrager trok in" } });

    const failed = run(instance("running"), command({
      type: "fail_instance",
      expectedStatus: "running",
      failureClass: "validation",
      errorCode: "invalid_output",
      errorMessage: "Node-output klopt niet.",
    }));
    expect(failed.state).toMatchObject({ status: "failed", errorClass: "validation", errorCode: "invalid_output" });
    expect(failed.event.eventType).toBe("workflow.instance.failed");

    const intervention = run(instance("waiting"), command({
      type: "require_instance_intervention",
      expectedStatus: "waiting",
      failureClass: "permanent_technical",
      errorCode: "adapter_missing",
      errorMessage: "Adapter ontbreekt.",
    }));
    expect(intervention.state).toMatchObject({ status: "needs_intervention", errorClass: "permanent_technical" });
    expect(intervention.state.completedAt).toBeUndefined();

    const resumed = run(intervention.state, command({ type: "resume_instance", expectedStatus: "needs_intervention" }));
    expect(resumed.state).toMatchObject({ status: "running", errorClass: undefined, errorCode: undefined });
  });

  it("runs node start, wait, resume and success transitions", () => {
    const started = run(node("ready"), command({
      type: "start_node",
      nodeInstanceId: "node-attempt-1",
      expectedStatus: "ready",
      leaseOwner: "worker-1",
      leaseExpiresAt: "2026-08-10T10:01:00.000Z",
    }));
    const waiting = run(started.state, command({ type: "wait_node", nodeInstanceId: "node-attempt-1", expectedStatus: "running" }));
    const resumed = run(waiting.state, command({ type: "resume_node", nodeInstanceId: "node-attempt-1", expectedStatus: "waiting" }));
    const succeeded = run(resumed.state, command({ type: "succeed_node", nodeInstanceId: "node-attempt-1", expectedStatus: "running", output: { approved: true } }));

    expect([started, waiting, resumed, succeeded].map(({ event }) => event.eventType)).toEqual([
      "workflow.node.started",
      "workflow.node.waiting",
      "workflow.node.resumed",
      "workflow.node.succeeded",
    ]);
    expect(started.state).toMatchObject({ leaseOwner: "worker-1", leaseExpiresAt: "2026-08-10T10:01:00.000Z" });
    expect(succeeded.state).toMatchObject({ status: "succeeded", output: { approved: true }, completedAt: "2026-08-10T10:00:00.000Z" });
  });

  it("can skip a ready node without pretending it was executed", () => {
    const skipped = run(node("ready"), command({
      type: "skip_node",
      nodeInstanceId: "node-attempt-1",
      expectedStatus: "ready",
      reason: "Conditionele edge niet gekozen",
    }));
    expect(skipped.state).toMatchObject({ status: "skipped", completedAt: "2026-08-10T10:00:00.000Z" });
    expect(skipped.state).not.toHaveProperty("startedAt");
    expect(skipped.event.payload).toEqual({ reason: "Conditionele edge niet gekozen" });
  });

  it("records a failed attempt and schedules a new attempt with exponential backoff", () => {
    const failed = run(node("running"), command({
      type: "fail_node",
      nodeInstanceId: "node-attempt-1",
      expectedStatus: "running",
      failureClass: "transient_technical",
      errorCode: "upstream_timeout",
      errorMessage: "Timeout.",
    }));
    const retried = run(failed.state, command({
      type: "retry_node",
      nodeInstanceId: "node-attempt-1",
      nextNodeInstanceId: "node-attempt-2",
      expectedStatus: "failed",
      mode: "automatic",
      reason: "Transient fout",
    }));

    expect(retried.persistence).toBe("insert_node_attempt");
    expect(retried.state).toMatchObject({
      nodeInstanceId: "node-attempt-2",
      status: "ready",
      attempt: 2,
      availableAt: "2026-08-10T10:00:01.000Z",
      startedAt: undefined,
      completedAt: undefined,
      errorClass: undefined,
    });
    expect(retried.event).toMatchObject({
      aggregateId: "node-attempt-1",
      eventType: "workflow.node.retry_scheduled",
      payload: { previousAttempt: 1, nextAttempt: 2, nextNodeInstanceId: "node-attempt-2" },
    });
  });

  it("supports an authorized manual retry from intervention without backoff", () => {
    const intervention = run(node("waiting"), command({
      type: "require_node_intervention",
      nodeInstanceId: "node-attempt-1",
      expectedStatus: "waiting",
      failureClass: "permanent_technical",
      errorCode: "configuration_missing",
      errorMessage: "Configuratie ontbreekt.",
    }));
    const retried = run(intervention.state, command({
      type: "retry_node",
      nodeInstanceId: "node-attempt-1",
      nextNodeInstanceId: "node-attempt-2",
      expectedStatus: "needs_intervention",
      mode: "manual",
      reason: "Configuratie hersteld",
    }));
    expect(retried.state).toMatchObject({ status: "ready", availableAt: "2026-08-10T10:00:00.000Z" });
  });

  it("never automatically retries human work or non-transient failures", () => {
    const humanFailure = node("failed", { executionKind: "human", errorClass: "transient_technical" });
    const nonTransient = node("failed", { errorClass: "authorization" });
    const retry = (state: WorkflowNodeState) => run(state, command({
      type: "retry_node",
      nodeInstanceId: "node-attempt-1",
      nextNodeInstanceId: "node-attempt-2",
      expectedStatus: "failed",
      mode: "automatic",
      reason: "Automatisch",
    }));

    for (const state of [humanFailure, nonTransient]) {
      expect(() => retry(state)).toThrowError(expect.objectContaining({ code: "retry_not_allowed" }));
    }
  });

  it("stops retrying when the attempt budget is exhausted", () => {
    const exhausted = node("failed", { attempt: 3, maxAttempts: 3, errorClass: "transient_technical" });
    expect(() => run(exhausted, command({
      type: "retry_node",
      nodeInstanceId: "node-attempt-1",
      nextNodeInstanceId: "node-attempt-4",
      expectedStatus: "failed",
      mode: "automatic",
      reason: "Nogmaals",
    }))).toThrowError(expect.objectContaining({ code: "retry_not_allowed" }));
  });

  it("uses expected status as optimistic lock and serializes all work on the instance lock", () => {
    expect(workflowInstanceLockKey("abc")).toBe("workflow-instance:abc");
    expect(() => run(instance("waiting"), command({ type: "complete_instance", expectedStatus: "running" })))
      .toThrowError(expect.objectContaining({ code: "optimistic_lock_conflict" }));
    expect(() => run(instance("waiting"), {
      ...command({ type: "start_instance", expectedStatus: "pending" }),
      expectedStatus: "waiting",
    } as unknown as WorkflowRuntimeCommand)).toThrowError(expect.objectContaining({ code: "invalid_command" }));
    expect(() => run(node("ready"), command({ type: "start_node", nodeInstanceId: "other-attempt", expectedStatus: "ready" })))
      .toThrowError(expect.objectContaining({ code: "aggregate_mismatch" }));
    expect(() => run(instance("pending"), command({ type: "start_instance", expectedStatus: "pending", occurredAt: "morgen" })))
      .toThrowError(expect.objectContaining({ code: "invalid_timestamp" }));
  });

  it("defines bounded retry timing and the complete command surface", () => {
    expect(retryDelayMs(1)).toBe(1_000);
    expect(retryDelayMs(2)).toBe(2_000);
    expect(retryDelayMs(99)).toBe(DEFAULT_WORKFLOW_RETRY_POLICY.maximumDelayMs);
    expect(WORKFLOW_RUNTIME_COMMAND_TYPES).toEqual([
      "start_instance", "wait_instance", "resume_instance", "complete_instance", "cancel_instance", "fail_instance", "require_instance_intervention",
      "start_node", "wait_node", "resume_node", "succeed_node", "skip_node", "fail_node", "require_node_intervention", "retry_node",
    ]);
    expect(WORKFLOW_RUNTIME_TRANSITION_RULES.retry_node).toEqual(["failed", "needs_intervention"]);
    expect([...TERMINAL_WORKFLOW_INSTANCE_STATUSES]).toEqual(["completed", "cancelled", "failed"]);
    expect([...TERMINAL_WORKFLOW_NODE_STATUSES]).toEqual(["succeeded", "skipped", "failed"]);
  });

  it("returns typed transition errors", () => {
    try {
      retryDelayMs(0);
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(WorkflowRuntimeTransitionError);
      expect(error).toMatchObject({ code: "retry_not_allowed" });
    }
  });
});
