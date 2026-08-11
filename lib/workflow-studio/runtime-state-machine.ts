export const WORKFLOW_INSTANCE_STATUSES = [
  "pending",
  "running",
  "waiting",
  "completed",
  "cancelled",
  "failed",
  "needs_intervention",
] as const;

export type WorkflowInstanceStatus = (typeof WORKFLOW_INSTANCE_STATUSES)[number];

export const WORKFLOW_NODE_STATUSES = [
  "ready",
  "running",
  "waiting",
  "succeeded",
  "skipped",
  "failed",
  "needs_intervention",
] as const;

export type WorkflowNodeStatus = (typeof WORKFLOW_NODE_STATUSES)[number];

export const WORKFLOW_FAILURE_CLASSES = [
  "validation",
  "authorization",
  "conflict",
  "transient_technical",
  "permanent_technical",
  "business_rejection",
] as const;

export type WorkflowFailureClass = (typeof WORKFLOW_FAILURE_CLASSES)[number];
export type WorkflowRuntimeActor = Readonly<{
  type: "user" | "system";
  id: string;
  sessionId?: string;
}>;

type RuntimeCommandBase = Readonly<{
  commandId: string;
  instanceId: string;
  expectedStatus: string;
  actor: WorkflowRuntimeActor;
  correlationId: string;
  causationId?: string;
  occurredAt: string;
}>;

type InstanceCommand<TType extends string, TStatus extends WorkflowInstanceStatus> = RuntimeCommandBase & Readonly<{
  type: TType;
  expectedStatus: TStatus;
}>;

type NodeCommand<TType extends string, TStatus extends WorkflowNodeStatus> = RuntimeCommandBase & Readonly<{
  type: TType;
  nodeInstanceId: string;
  expectedStatus: TStatus;
}>;

export type WorkflowRuntimeCommand =
  | InstanceCommand<"start_instance", "pending">
  | InstanceCommand<"wait_instance", "running">
  | InstanceCommand<"resume_instance", "waiting" | "needs_intervention">
  | (InstanceCommand<"complete_instance", "running"> & Readonly<{ result?: Readonly<Record<string, unknown>> }>)
  | (InstanceCommand<"cancel_instance", "pending" | "running" | "waiting" | "needs_intervention"> & Readonly<{ reason: string }>)
  | (InstanceCommand<"fail_instance", "running" | "waiting"> & WorkflowRuntimeFailure)
  | (InstanceCommand<"require_instance_intervention", "running" | "waiting"> & WorkflowRuntimeFailure)
  | (NodeCommand<"start_node", "ready"> & Readonly<{ leaseOwner?: string; leaseExpiresAt?: string }>)
  | NodeCommand<"wait_node", "running">
  | NodeCommand<"resume_node", "waiting">
  | (NodeCommand<"succeed_node", "running"> & Readonly<{
      output?: Readonly<Record<string, unknown>>;
      outputVariables?: readonly WorkflowVariableAssignment[];
      selectedOutputPort?: string;
    }>)
  | (NodeCommand<"skip_node", "ready"> & Readonly<{ reason: string }>)
  | (NodeCommand<"fail_node", "running"> & WorkflowRuntimeFailure)
  | (NodeCommand<"require_node_intervention", "running" | "waiting"> & WorkflowRuntimeFailure)
  | (NodeCommand<"retry_node", "failed" | "needs_intervention"> & Readonly<{
      nextNodeInstanceId: string;
      mode: "automatic" | "manual";
      reason: string;
    }>);

export type WorkflowRuntimeFailure = Readonly<{
  failureClass: WorkflowFailureClass;
  errorCode: string;
  errorMessage: string;
}>;

export type WorkflowInstanceState = Readonly<{
  kind: "instance";
  instanceId: string;
  status: WorkflowInstanceStatus;
  startedAt?: string;
  completedAt?: string;
  result?: Readonly<Record<string, unknown>>;
  errorClass?: WorkflowFailureClass;
  errorCode?: string;
  errorMessage?: string;
}>;

export type WorkflowNodeState = Readonly<{
  kind: "node";
  instanceId: string;
  nodeInstanceId: string;
  status: WorkflowNodeStatus;
  executionKind: "automated" | "human";
  attempt: number;
  maxAttempts: number;
  availableAt: string;
  startedAt?: string;
  completedAt?: string;
  output?: Readonly<Record<string, unknown>>;
  errorClass?: WorkflowFailureClass;
  errorCode?: string;
  errorMessage?: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
}>;

export type WorkflowRuntimeState = WorkflowInstanceState | WorkflowNodeState;

export type WorkflowRuntimeEvent = Readonly<{
  eventType: string;
  eventVersion: 1;
  aggregateType: "instance" | "node";
  aggregateId: string;
  instanceId: string;
  commandType: WorkflowRuntimeCommand["type"];
  fromStatus: WorkflowInstanceStatus | WorkflowNodeStatus;
  toStatus: WorkflowInstanceStatus | WorkflowNodeStatus;
  payload: Readonly<Record<string, unknown>>;
  actor: WorkflowRuntimeActor;
  idempotencyKey: string;
  correlationId: string;
  causationId?: string;
  occurredAt: string;
}>;

export type WorkflowRuntimeTransition = Readonly<{
  lockKey: string;
  state: WorkflowRuntimeState;
  event: WorkflowRuntimeEvent;
  persistence: "update_aggregate" | "insert_node_attempt";
}>;

export type WorkflowRetryPolicy = Readonly<{
  initialDelayMs: number;
  multiplier: number;
  maximumDelayMs: number;
}>;

export const DEFAULT_WORKFLOW_RETRY_POLICY: WorkflowRetryPolicy = Object.freeze({
  initialDelayMs: 1_000,
  multiplier: 2,
  maximumDelayMs: 15 * 60 * 1_000,
});

export const WORKFLOW_RUNTIME_TRANSITION_RULES: Readonly<Record<WorkflowRuntimeCommand["type"], readonly string[]>> = Object.freeze({
  start_instance: ["pending"],
  wait_instance: ["running"],
  resume_instance: ["waiting", "needs_intervention"],
  complete_instance: ["running"],
  cancel_instance: ["pending", "running", "waiting", "needs_intervention"],
  fail_instance: ["running", "waiting"],
  require_instance_intervention: ["running", "waiting"],
  start_node: ["ready"],
  wait_node: ["running"],
  resume_node: ["waiting"],
  succeed_node: ["running"],
  skip_node: ["ready"],
  fail_node: ["running"],
  require_node_intervention: ["running", "waiting"],
  retry_node: ["failed", "needs_intervention"],
});

export const TERMINAL_WORKFLOW_INSTANCE_STATUSES: ReadonlySet<WorkflowInstanceStatus> = new Set([
  "completed", "cancelled", "failed",
]);

export const TERMINAL_WORKFLOW_NODE_STATUSES: ReadonlySet<WorkflowNodeStatus> = new Set([
  "succeeded", "skipped", "failed",
]);

export type WorkflowRuntimeTransitionErrorCode =
  | "aggregate_mismatch"
  | "invalid_command"
  | "invalid_timestamp"
  | "optimistic_lock_conflict"
  | "retry_not_allowed";

export class WorkflowRuntimeTransitionError extends Error {
  constructor(
    readonly code: WorkflowRuntimeTransitionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WorkflowRuntimeTransitionError";
  }
}

export function workflowInstanceLockKey(instanceId: string): string {
  return `workflow-instance:${instanceId}`;
}

export function retryDelayMs(attempt: number, policy: WorkflowRetryPolicy = DEFAULT_WORKFLOW_RETRY_POLICY): number {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new WorkflowRuntimeTransitionError("retry_not_allowed", "Attempt moet een positief geheel getal zijn.");
  }
  return Math.min(policy.initialDelayMs * policy.multiplier ** (attempt - 1), policy.maximumDelayMs);
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new WorkflowRuntimeTransitionError("invalid_timestamp", `Ongeldig commandtijdstip: ${value}.`);
  }
  return parsed;
}

function assertCommandMatchesState(state: WorkflowRuntimeState, command: WorkflowRuntimeCommand): void {
  if (state.instanceId !== command.instanceId) {
    throw new WorkflowRuntimeTransitionError("aggregate_mismatch", "Command en runtime-state horen niet bij dezelfde instance.");
  }
  if (state.status !== command.expectedStatus) {
    throw new WorkflowRuntimeTransitionError(
      "optimistic_lock_conflict",
      `Verwachtte status ${command.expectedStatus}, maar de actuele status is ${state.status}.`,
    );
  }
  if (!WORKFLOW_RUNTIME_TRANSITION_RULES[command.type]?.includes(state.status)) {
    throw new WorkflowRuntimeTransitionError(
      "invalid_command",
      `Command ${command.type} is niet toegestaan vanuit status ${state.status}.`,
    );
  }
  if (state.kind === "node" && (!("nodeInstanceId" in command) || state.nodeInstanceId !== command.nodeInstanceId)) {
    throw new WorkflowRuntimeTransitionError("aggregate_mismatch", "Command en runtime-state horen niet bij hetzelfde node-attempt.");
  }
  const occurredAt = timestamp(command.occurredAt);
  if (state.startedAt && occurredAt < timestamp(state.startedAt)) {
    throw new WorkflowRuntimeTransitionError("invalid_timestamp", "Commandtijdstip ligt vóór de start van het runtime-record.");
  }
}

function failurePayload(command: WorkflowRuntimeCommand): WorkflowRuntimeFailure {
  if (!("failureClass" in command) || !("errorCode" in command) || !("errorMessage" in command)) {
    throw new WorkflowRuntimeTransitionError("invalid_command", "Failure-command mist foutclassificatie, foutcode of foutmelding.");
  }
  return {
    failureClass: command.failureClass,
    errorCode: command.errorCode,
    errorMessage: command.errorMessage,
  };
}

function eventFor(
  previous: WorkflowRuntimeState,
  next: WorkflowRuntimeState,
  command: WorkflowRuntimeCommand,
  eventType: string,
  payload: Readonly<Record<string, unknown>> = {},
): WorkflowRuntimeEvent {
  return Object.freeze({
    eventType,
    eventVersion: 1,
    aggregateType: previous.kind,
    aggregateId: previous.kind === "instance" ? previous.instanceId : previous.nodeInstanceId,
    instanceId: previous.instanceId,
    commandType: command.type,
    fromStatus: previous.status,
    toStatus: next.status,
    payload: Object.freeze({ ...payload }),
    actor: Object.freeze({ ...command.actor }),
    idempotencyKey: command.commandId,
    correlationId: command.correlationId,
    ...(command.causationId ? { causationId: command.causationId } : {}),
    occurredAt: command.occurredAt,
  });
}

function transition(
  previous: WorkflowRuntimeState,
  next: WorkflowRuntimeState,
  command: WorkflowRuntimeCommand,
  eventType: string,
  payload: Readonly<Record<string, unknown>> = {},
  persistence: WorkflowRuntimeTransition["persistence"] = "update_aggregate",
): WorkflowRuntimeTransition {
  return Object.freeze({
    lockKey: workflowInstanceLockKey(previous.instanceId),
    state: Object.freeze(next),
    event: eventFor(previous, next, command, eventType, payload),
    persistence,
  });
}

type CommandHandler = (state: WorkflowRuntimeState, command: WorkflowRuntimeCommand, policy: WorkflowRetryPolicy) => WorkflowRuntimeTransition;

function requireInstance(state: WorkflowRuntimeState): WorkflowInstanceState {
  if (state.kind !== "instance") throw new WorkflowRuntimeTransitionError("invalid_command", "Instance-command vereist instance-state.");
  return state;
}

function requireNode(state: WorkflowRuntimeState): WorkflowNodeState {
  if (state.kind !== "node") throw new WorkflowRuntimeTransitionError("invalid_command", "Node-command vereist node-state.");
  return state;
}

function withInstanceStatus(state: WorkflowInstanceState, status: WorkflowInstanceStatus, command: WorkflowRuntimeCommand): WorkflowInstanceState {
  const terminal = TERMINAL_WORKFLOW_INSTANCE_STATUSES.has(status);
  return {
    ...state,
    status,
    ...(status === "running" && !state.startedAt ? { startedAt: command.occurredAt } : {}),
    ...(terminal ? { completedAt: command.occurredAt } : {}),
  };
}

function withNodeStatus(state: WorkflowNodeState, status: WorkflowNodeStatus, command: WorkflowRuntimeCommand): WorkflowNodeState {
  const terminal = TERMINAL_WORKFLOW_NODE_STATUSES.has(status);
  return {
    ...state,
    status,
    ...(status === "running" && !state.startedAt ? { startedAt: command.occurredAt } : {}),
    ...(terminal ? { completedAt: command.occurredAt } : {}),
    ...(["running", "waiting", "needs_intervention"].includes(status) ? {} : { leaseOwner: undefined, leaseExpiresAt: undefined }),
  };
}

const COMMAND_HANDLERS: Readonly<Record<WorkflowRuntimeCommand["type"], CommandHandler>> = Object.freeze({
  start_instance: (raw, command) => {
    const state = requireInstance(raw);
    const next = withInstanceStatus(state, "running", command);
    return transition(state, next, command, "workflow.instance.started");
  },
  wait_instance: (raw, command) => {
    const state = requireInstance(raw);
    return transition(state, withInstanceStatus(state, "waiting", command), command, "workflow.instance.waiting");
  },
  resume_instance: (raw, command) => {
    const state = requireInstance(raw);
    const next = { ...withInstanceStatus(state, "running", command), errorClass: undefined, errorCode: undefined, errorMessage: undefined };
    return transition(state, next, command, "workflow.instance.resumed");
  },
  complete_instance: (raw, command) => {
    const state = requireInstance(raw);
    const result = "result" in command ? command.result : undefined;
    const next = { ...withInstanceStatus(state, "completed", command), ...(result ? { result } : {}) };
    return transition(state, next, command, "workflow.instance.completed", result ? { result } : {});
  },
  cancel_instance: (raw, command) => {
    const state = requireInstance(raw);
    const reason = "reason" in command ? command.reason : "";
    return transition(state, withInstanceStatus(state, "cancelled", command), command, "workflow.instance.cancelled", { reason });
  },
  fail_instance: (raw, command) => {
    const state = requireInstance(raw);
    const failure = failurePayload(command);
    const next = { ...withInstanceStatus(state, "failed", command), errorClass: failure.failureClass, errorCode: failure.errorCode, errorMessage: failure.errorMessage };
    return transition(state, next, command, "workflow.instance.failed", failure);
  },
  require_instance_intervention: (raw, command) => {
    const state = requireInstance(raw);
    const failure = failurePayload(command);
    const next = { ...withInstanceStatus(state, "needs_intervention", command), errorClass: failure.failureClass, errorCode: failure.errorCode, errorMessage: failure.errorMessage };
    return transition(state, next, command, "workflow.instance.intervention_required", failure);
  },
  start_node: (raw, command) => {
    const state = requireNode(raw);
    const leaseOwner = "leaseOwner" in command ? command.leaseOwner : undefined;
    const leaseExpiresAt = "leaseExpiresAt" in command ? command.leaseExpiresAt : undefined;
    if ((leaseOwner && !leaseExpiresAt) || (!leaseOwner && leaseExpiresAt)) {
      throw new WorkflowRuntimeTransitionError("invalid_command", "Lease-owner en lease-eindtijd moeten samen worden opgegeven.");
    }
    if (leaseExpiresAt && timestamp(leaseExpiresAt) <= timestamp(command.occurredAt)) {
      throw new WorkflowRuntimeTransitionError("invalid_timestamp", "De nodelease moet na het commandtijdstip verlopen.");
    }
    const next = {
      ...withNodeStatus(state, "running", command),
      ...(leaseOwner && leaseExpiresAt ? { leaseOwner, leaseExpiresAt } : {}),
    };
    return transition(state, next, command, "workflow.node.started", leaseOwner && leaseExpiresAt ? { leaseOwner, leaseExpiresAt } : {});
  },
  wait_node: (raw, command) => {
    const state = requireNode(raw);
    return transition(state, withNodeStatus(state, "waiting", command), command, "workflow.node.waiting");
  },
  resume_node: (raw, command) => {
    const state = requireNode(raw);
    return transition(state, withNodeStatus(state, "running", command), command, "workflow.node.resumed");
  },
  succeed_node: (raw, command) => {
    const state = requireNode(raw);
    const output = "output" in command ? command.output : undefined;
    const outputVariables = "outputVariables" in command ? command.outputVariables : undefined;
    const selectedOutputPort = "selectedOutputPort" in command ? command.selectedOutputPort : undefined;
    const next = { ...withNodeStatus(state, "succeeded", command), ...(output ? { output } : {}) };
    return transition(state, next, command, "workflow.node.succeeded", {
      ...(output ? { output } : {}),
      ...(outputVariables ? { outputVariables: outputVariables.map(({ name, dataType, classification }) => ({ name, dataType, classification: classification ?? "internal" })) } : {}),
      ...(selectedOutputPort ? { selectedOutputPort } : {}),
    });
  },
  skip_node: (raw, command) => {
    const state = requireNode(raw);
    const reason = "reason" in command ? command.reason : "";
    return transition(state, withNodeStatus(state, "skipped", command), command, "workflow.node.skipped", { reason });
  },
  fail_node: (raw, command) => {
    const state = requireNode(raw);
    const failure = failurePayload(command);
    const next = { ...withNodeStatus(state, "failed", command), errorClass: failure.failureClass, errorCode: failure.errorCode, errorMessage: failure.errorMessage };
    return transition(state, next, command, "workflow.node.failed", failure);
  },
  require_node_intervention: (raw, command) => {
    const state = requireNode(raw);
    const failure = failurePayload(command);
    const next = { ...withNodeStatus(state, "needs_intervention", command), errorClass: failure.failureClass, errorCode: failure.errorCode, errorMessage: failure.errorMessage };
    return transition(state, next, command, "workflow.node.intervention_required", failure);
  },
  retry_node: (raw, command, policy) => {
    const state = requireNode(raw);
    if (!("nextNodeInstanceId" in command) || !("mode" in command) || !("reason" in command)) {
      throw new WorkflowRuntimeTransitionError("invalid_command", "Retry-command mist verplichte retryvelden.");
    }
    if (state.attempt >= state.maxAttempts) {
      throw new WorkflowRuntimeTransitionError("retry_not_allowed", "Het maximale aantal node-attempts is bereikt.");
    }
    if (command.mode === "automatic" && (state.errorClass !== "transient_technical" || state.executionKind === "human")) {
      throw new WorkflowRuntimeTransitionError("retry_not_allowed", "Automatische retries zijn alleen toegestaan voor transient technische fouten van geautomatiseerde nodes.");
    }
    const delayMs = command.mode === "automatic" ? retryDelayMs(state.attempt, policy) : 0;
    const availableAt = new Date(timestamp(command.occurredAt) + delayMs).toISOString();
    const next: WorkflowNodeState = {
      ...state,
      nodeInstanceId: command.nextNodeInstanceId,
      status: "ready",
      attempt: state.attempt + 1,
      availableAt,
      startedAt: undefined,
      completedAt: undefined,
      output: undefined,
      errorClass: undefined,
      errorCode: undefined,
      errorMessage: undefined,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
    };
    return transition(state, next, command, "workflow.node.retry_scheduled", {
      previousNodeInstanceId: state.nodeInstanceId,
      nextNodeInstanceId: command.nextNodeInstanceId,
      previousAttempt: state.attempt,
      nextAttempt: next.attempt,
      mode: command.mode,
      reason: command.reason,
      availableAt,
    }, "insert_node_attempt");
  },
});

export const WORKFLOW_RUNTIME_COMMAND_TYPES = Object.freeze(Object.keys(COMMAND_HANDLERS) as WorkflowRuntimeCommand["type"][]);

export function handleWorkflowRuntimeCommand(
  state: WorkflowRuntimeState,
  command: WorkflowRuntimeCommand,
  retryPolicy: WorkflowRetryPolicy = DEFAULT_WORKFLOW_RETRY_POLICY,
): WorkflowRuntimeTransition {
  assertCommandMatchesState(state, command);
  const handler = COMMAND_HANDLERS[command.type];
  if (!handler) throw new WorkflowRuntimeTransitionError("invalid_command", `Onbekend runtime-command: ${String(command.type)}.`);
  return handler(state, command, retryPolicy);
}
import type { WorkflowVariableAssignment } from "@/lib/workflow-studio/runtime-variables";
