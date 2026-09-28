import { randomUUID } from "node:crypto";

import type { IdentityContext } from "@/lib/identity/types";
import {
  workflowDecisionConfigurationSchema,
} from "@/lib/workflow-studio/decision-schema";
import {
  ClientConfigMutationContractService,
  WORKFLOW_CHANGE_INTENT_VERSION,
  type MutationDryRunResult,
  type MutationExecutionResult,
  type WorkflowChangeIntent,
} from "@/lib/workflow-studio/mutation-adapters";
import {
  clientConfigReadService,
  type ClientConfigReadRecord,
  type ClientConfigReadService,
  type JsonValue,
  type WorkflowDataSnapshot,
} from "@/lib/workflow-studio/read-adapters";
import { workflowLookupConfigurationSchema } from "@/lib/workflow-studio/lookup-schema";
import {
  renderWorkflowNotification,
  workflowNotificationConfigurationSchema,
} from "@/lib/workflow-studio/notification-schema";
import { workflowIntegrationConfigurationSchema } from "@/lib/workflow-studio/integration-schema";
import type { WorkflowOutboxEnqueueInput, WorkflowOutboxMessage } from "@/lib/workflow-studio/runtime-outbox";
import {
  handleWorkflowRuntimeCommand,
  type WorkflowInstanceState,
  type WorkflowNodeState,
  type WorkflowRuntimeActor,
  type WorkflowRuntimeCommand,
  type WorkflowRuntimeEvent,
  type WorkflowRuntimeState,
  type WorkflowRuntimeTransition,
} from "@/lib/workflow-studio/runtime-state-machine";
import {
  WorkflowVariableRuntimeError,
  evaluateWorkflowRuntimeExpression,
  validateWorkflowVariableAssignments,
  type WorkflowVariableAssignment,
  type WorkflowVariableRecord,
  type WorkflowVariableWrite,
  type WorkflowVariableWriteResult,
  workflowVariableValues,
} from "@/lib/workflow-studio/runtime-variables";
import {
  workflowApprovalConfigurationSchema,
  workflowRoleTaskConfigurationSchema,
  type WorkflowApprovalDecision,
} from "@/lib/workflow-studio/runtime-human-schema";
import { workflowChangeRequestConfigurationSchema } from "@/lib/workflow-studio/change-request-schema";
import { workflowParallelJoinConfigurationSchema } from "@/lib/workflow-studio/parallel-gateway-schema";
import { calculateWorkflowBusinessDeadline } from "@/lib/workflow-studio/runtime-calendar";
import {
  evaluateWorkflowApprovalPolicy,
  type WorkflowApprovalPolicy,
  type WorkflowApprovalVote,
} from "@/lib/workflow-studio/multi-approval";

export type WorkflowRuntimeNodeDefinition = Readonly<{
  id: string;
  workflowVersionId: string;
  nodeKey: string;
  blockType: string;
  configuration: Readonly<Record<string, unknown>>;
}>;

export type WorkflowRuntimeEdgeDefinition = Readonly<{
  id: string;
  workflowVersionId: string;
  edgeKey: string;
  sourceNodeId: string;
  sourcePort: string;
  targetNodeId: string;
  targetPort: string;
  condition: unknown | null;
}>;

export type WorkflowRuntimeGraph = Readonly<{
  workflowVersionId: string;
  definitionStatus: "draft" | "published" | "deprecated" | "archived";
  tenant: string;
  businessUnit: string;
  clientIds: readonly string[] | null;
  nodes: readonly WorkflowRuntimeNodeDefinition[];
  edges: readonly WorkflowRuntimeEdgeDefinition[];
}>;

export type WorkflowRuntimeInstanceRecord = WorkflowInstanceState & Readonly<{
  workflowVersionId: string;
  tenant: string;
  businessUnit: string;
  clientIds: readonly string[] | null;
  idempotencyKey: string;
  correlationId: string;
  startedByUserId: string;
  input: Readonly<Record<string, unknown>>;
  deadlineAt?: string;
}>;

export type WorkflowRuntimeNodeRecord = WorkflowNodeState & Readonly<{
  workflowVersionId: string;
  workflowNodeId: string;
  nodeKey: string;
  blockType: string;
  input: Readonly<Record<string, unknown>>;
  idempotencyKey: string;
  correlationId: string;
  causationId?: string;
  deadlineAt?: string;
}>;

export type WorkflowEngineEvent = Readonly<{
  id?: string;
  sequenceNumber?: number;
  instanceId: string;
  nodeInstanceId?: string;
  eventType: string;
  eventVersion: number;
  payload: Readonly<Record<string, unknown>>;
  actor: WorkflowRuntimeActor;
  idempotencyKey: string;
  correlationId: string;
  causationId?: string;
  occurredAt: string;
}>;

export type InsertWorkflowInstance = Omit<WorkflowRuntimeInstanceRecord, "kind" | "status">;
export type InsertWorkflowNodeAttempt = Omit<WorkflowRuntimeNodeRecord, "kind" | "status" | "attempt" | "availableAt"> & Readonly<{
  nodeInstanceId: string;
  status?: "ready";
  availableAt: string;
}>;

export type InsertNodeAttemptResult = Readonly<{
  node: WorkflowRuntimeNodeRecord;
  created: boolean;
}>;

export type WorkflowRuntimeSnapshotRecord = Readonly<{
  id: string;
  instanceId: string;
  sourceNodeInstanceId: string;
  resourceId: string;
  sourceRecordId: string;
  selectedFields: Readonly<Record<string, JsonValue>>;
  concurrencyToken: string;
  snapshotVersion: number;
  idempotencyKey: string;
  correlationId: string;
  causationId?: string;
  readAt: string;
}>;

export type WorkflowRuntimeSnapshotWrite = Readonly<{
  id: string;
  instanceId: string;
  sourceNodeInstanceId: string;
  snapshot: WorkflowDataSnapshot;
  idempotencyKey: string;
  correlationId: string;
  causationId?: string;
}>;

export type WorkflowRuntimeSnapshotWriteResult = Readonly<{
  snapshot: WorkflowRuntimeSnapshotRecord;
  created: boolean;
}>;

export type WorkflowRuntimeChangeIntentStatus = "draft" | "validated" | "approved" | "applying" | "applied" | "rejected" | "conflicted" | "failed";

export type WorkflowRuntimeChangeIntentRecord = Readonly<{
  id: string;
  instanceId: string;
  nodeInstanceId: string;
  snapshotId?: string;
  adapterId: string;
  resourceId: string;
  operation: "CREATE" | "UPDATE" | "RETIRE";
  status: WorkflowRuntimeChangeIntentStatus;
  payload: Readonly<Record<string, unknown>>;
  preconditions: Readonly<Record<string, unknown>>;
  dryRunResult?: MutationDryRunResult;
  applyResult?: MutationExecutionResult;
  idempotencyKey: string;
  correlationId: string;
  causationId?: string;
  effectiveAt?: string;
  approvedByUserId?: string;
  approvedAt?: string;
  appliedAt?: string;
  createdAt: string;
  updatedAt: string;
}>;

export type WorkflowRuntimeChangeIntentWrite = Readonly<{
  id: string;
  instanceId: string;
  nodeInstanceId: string;
  snapshotId?: string;
  adapterId: string;
  resourceId: string;
  operation: "CREATE" | "UPDATE" | "RETIRE";
  status: WorkflowRuntimeChangeIntentStatus;
  payload: Readonly<Record<string, unknown>>;
  preconditions: Readonly<Record<string, unknown>>;
  dryRunResult?: MutationDryRunResult;
  applyResult?: MutationExecutionResult;
  idempotencyKey: string;
  correlationId: string;
  causationId?: string;
  effectiveAt?: string;
}>;

export type WorkflowRuntimeChangeIntentWriteResult = Readonly<{
  intent: WorkflowRuntimeChangeIntentRecord;
  created: boolean;
}>;

export type WorkflowRuntimeChangeIntentApplyUpdate = Readonly<{
  instanceId: string;
  intentId: string;
  status: WorkflowRuntimeChangeIntentStatus;
  dryRunResult?: MutationDryRunResult;
  applyResult: MutationExecutionResult;
  approvedByUserId?: string;
  approvedAt?: string;
  appliedAt?: string;
}>;

export type WorkflowRuntimeMutationApplyRequest = Readonly<{
  identity: IdentityContext;
  scope: Readonly<{ tenant: string; businessUnit: string; clientIds?: readonly string[] }>;
  intent: WorkflowChangeIntent;
  dryRun: MutationDryRunResult;
  runtime: Readonly<{
    workflowInstanceId: string;
    workflowVersionId: string;
    workflowNodeInstanceId: string;
    changeIntentId: string;
    actor: WorkflowRuntimeActor;
    correlationId: string;
    causationId: string;
    occurredAt: string;
  }>;
}>;

export type WorkflowRuntimeMutationService = Pick<ClientConfigMutationContractService, "dryRun"> & Readonly<{
  apply?: (request: WorkflowRuntimeMutationApplyRequest) => Promise<MutationExecutionResult>;
}>;

export type WorkflowRuntimeOutboxWriteResult = Readonly<{
  message: WorkflowOutboxMessage;
  created: boolean;
}>;

export type WorkflowRuntimeRoleBindingRecord = Readonly<{
  id: string;
  workflowVersionId: string;
  workflowRole: string;
  identityGroup: string;
  permissions: readonly string[];
  tenant: string;
  businessUnit: string;
  clientIds: readonly string[] | null;
}>;

export type WorkflowTaskStatus = "open" | "claimed" | "completed" | "cancelled" | "expired";

export type WorkflowTaskRecord = Readonly<{
  id: string;
  instanceId: string;
  workflowVersionId: string;
  nodeInstanceId: string;
  roleBindingId: string;
  status: WorkflowTaskStatus;
  title: string;
  instructions: string;
  assigneeGroup: string;
  claimedByUserId?: string;
  outcome?: string;
  formData?: Readonly<Record<string, unknown>>;
  completionComment?: string;
  idempotencyKey: string;
  correlationId: string;
  causationId?: string;
  deadlineAt?: string;
  claimedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  workflowRole: string;
  permissions: readonly string[];
  tenant: string;
  businessUnit: string;
  clientIds: readonly string[] | null;
}>;

export type InsertWorkflowTask = Readonly<{
  id: string;
  instanceId: string;
  workflowVersionId: string;
  nodeInstanceId: string;
  roleBindingId: string;
  title: string;
  instructions: string;
  assigneeGroup: string;
  idempotencyKey: string;
  correlationId: string;
  causationId?: string;
  deadlineAt?: string;
}>;

export type WorkflowTaskMutation = Readonly<{
  taskId: string;
  status: WorkflowTaskStatus;
  claimedByUserId?: string;
  outcome?: string;
  formData?: Readonly<Record<string, unknown>>;
  completionComment?: string;
  claimedAt?: string;
  completedAt?: string;
}>;

export type WorkflowTaskWriteResult = Readonly<{ task: WorkflowTaskRecord; created: boolean }>;

export interface WorkflowRuntimeTransaction {
  findInstanceByStartKey(tenant: string, idempotencyKey: string): Promise<WorkflowRuntimeInstanceRecord | null>;
  loadPublishedGraph(workflowVersionId: string): Promise<WorkflowRuntimeGraph | null>;
  insertInstance(input: InsertWorkflowInstance): Promise<WorkflowRuntimeInstanceRecord | null>;
  lockInstance(instanceId: string): Promise<WorkflowRuntimeInstanceRecord | null>;
  updateInstance(state: WorkflowRuntimeInstanceRecord): Promise<void>;
  loadNode(nodeInstanceId: string): Promise<WorkflowRuntimeNodeRecord | null>;
  updateNode(state: WorkflowRuntimeNodeRecord): Promise<void>;
  insertNodeAttempt(input: InsertWorkflowNodeAttempt): Promise<InsertNodeAttemptResult>;
  findCommandEvent(instanceId: string, idempotencyKey: string): Promise<WorkflowEngineEvent | null>;
  appendEvent(event: WorkflowEngineEvent): Promise<WorkflowEngineEvent>;
  listEvents(instanceId: string): Promise<readonly WorkflowEngineEvent[]>;
  listOutgoingEdges(workflowVersionId: string, sourceNodeId: string, sourcePort: string): Promise<readonly WorkflowRuntimeEdgeDefinition[]>;
  listIncomingEdges(workflowVersionId: string, targetNodeId: string, targetPort: string): Promise<readonly WorkflowRuntimeEdgeDefinition[]>;
  findRunnableNode(instanceId: string, availableAt: string): Promise<WorkflowRuntimeNodeRecord | null>;
  listNodes(instanceId: string): Promise<readonly WorkflowRuntimeNodeRecord[]>;
  listVariables(instanceId: string): Promise<readonly WorkflowVariableRecord[]>;
  writeVariable(input: WorkflowVariableWrite): Promise<WorkflowVariableWriteResult>;
  loadDataSnapshot(instanceId: string, snapshotId: string): Promise<WorkflowRuntimeSnapshotRecord | null>;
  writeDataSnapshot(input: WorkflowRuntimeSnapshotWrite): Promise<WorkflowRuntimeSnapshotWriteResult>;
  writeChangeIntent(input: WorkflowRuntimeChangeIntentWrite): Promise<WorkflowRuntimeChangeIntentWriteResult>;
  loadChangeIntent(instanceId: string, intentId: string): Promise<WorkflowRuntimeChangeIntentRecord | null>;
  updateChangeIntentApplyResult(input: WorkflowRuntimeChangeIntentApplyUpdate): Promise<WorkflowRuntimeChangeIntentRecord>;
  enqueueOutbox(input: WorkflowOutboxEnqueueInput): Promise<WorkflowRuntimeOutboxWriteResult>;
  findRoleBinding(workflowVersionId: string, workflowRole: string, permission: string): Promise<WorkflowRuntimeRoleBindingRecord | null>;
  writeTask(input: InsertWorkflowTask): Promise<WorkflowTaskWriteResult>;
  loadTask(taskId: string): Promise<WorkflowTaskRecord | null>;
  updateTask(input: WorkflowTaskMutation): Promise<WorkflowTaskRecord>;
  listTasksForGroups(identityGroups: readonly string[], statuses?: readonly WorkflowTaskStatus[]): Promise<readonly WorkflowTaskRecord[]>;
  listOverdueTasks(now: string): Promise<readonly WorkflowTaskRecord[]>;
}

export interface WorkflowRuntimeStore {
  transaction<T>(work: (transaction: WorkflowRuntimeTransaction) => Promise<T>): Promise<T>;
}

export type StartWorkflowInstanceInput = Readonly<{
  workflowVersionId: string;
  idempotencyKey: string;
  correlationId: string;
  actor: WorkflowRuntimeActor;
  input?: Readonly<Record<string, unknown>>;
  variables?: readonly WorkflowVariableAssignment[];
  clientIds?: readonly string[];
  deadlineAt?: string;
  occurredAt: string;
  instanceId?: string;
}>;

export type WorkflowEngineResult = Readonly<{
  instance: WorkflowRuntimeInstanceRecord;
  state: WorkflowRuntimeState;
  activatedNodes: readonly WorkflowRuntimeNodeRecord[];
  events: readonly WorkflowEngineEvent[];
  variables: readonly WorkflowVariableRecord[];
  deduplicated: boolean;
}>;

export type WorkflowRuntimeEngineErrorCode =
  | "comment_required"
  | "decision_route_ambiguous"
  | "decision_route_not_found"
  | "instance_not_found"
  | "instance_not_runnable"
  | "invalid_graph"
  | "approval_policy_violation"
  | "lookup_failed"
  | "maker_checker_conflict"
  | "node_not_found"
  | "scope_mismatch"
  | "version_not_published";

export class WorkflowRuntimeEngineError extends Error {
  constructor(readonly code: WorkflowRuntimeEngineErrorCode, message: string) {
    super(message);
    this.name = "WorkflowRuntimeEngineError";
  }
}

function executionKind(blockType: string): WorkflowNodeState["executionKind"] {
  return ["form", "role_task", "approval"].includes(blockType) ? "human" : "automated";
}

function assertClientScope(graph: WorkflowRuntimeGraph, requested: readonly string[] | undefined): readonly string[] | null {
  if (!requested) return graph.clientIds;
  const normalized = [...new Set(requested)].sort();
  if (normalized.length === 0 || (graph.clientIds && normalized.some((id) => !graph.clientIds!.includes(id)))) {
    throw new WorkflowRuntimeEngineError("scope_mismatch", "De instance-clientscope valt buiten de gepubliceerde workflowscope.");
  }
  return normalized;
}

function transitionEvent(event: WorkflowRuntimeEvent, nodeInstanceId?: string): WorkflowEngineEvent {
  return {
    instanceId: event.instanceId,
    ...(nodeInstanceId ? { nodeInstanceId } : {}),
    eventType: event.eventType,
    eventVersion: event.eventVersion,
    payload: {
      ...event.payload,
      commandType: event.commandType,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
    },
    actor: event.actor,
    idempotencyKey: event.idempotencyKey,
    correlationId: event.correlationId,
    ...(event.causationId ? { causationId: event.causationId } : {}),
    occurredAt: event.occurredAt,
  };
}

function activationEvent(input: {
  instance: WorkflowRuntimeInstanceRecord;
  node: WorkflowRuntimeNodeRecord;
  actor: WorkflowRuntimeActor;
  idempotencyKey: string;
  causationId: string;
  occurredAt: string;
  sourceEdgeId?: string;
}): WorkflowEngineEvent {
  return {
    instanceId: input.instance.instanceId,
    nodeInstanceId: input.node.nodeInstanceId,
    eventType: "workflow.node.activated",
    eventVersion: 1,
    payload: {
      workflowNodeId: input.node.workflowNodeId,
      nodeKey: input.node.nodeKey,
      blockType: input.node.blockType,
      attempt: input.node.attempt,
      ...(input.sourceEdgeId ? { sourceEdgeId: input.sourceEdgeId } : {}),
    },
    actor: input.actor,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.instance.correlationId,
    causationId: input.causationId,
    occurredAt: input.occurredAt,
  };
}

function joinStatusEvent(input: {
  instance: WorkflowRuntimeInstanceRecord;
  node: WorkflowRuntimeNodeRecord;
  actor: WorkflowRuntimeActor;
  idempotencyKey: string;
  causationId: string;
  occurredAt: string;
  satisfied: boolean;
  succeededBranches: number;
  terminalBranches: number;
  requiredBranches: number;
}): WorkflowEngineEvent {
  return {
    instanceId: input.instance.instanceId,
    nodeInstanceId: input.node.nodeInstanceId,
    eventType: input.satisfied ? "workflow.parallel_join.ready" : "workflow.parallel_join.waiting",
    eventVersion: 1,
    payload: {
      nodeKey: input.node.nodeKey,
      satisfied: input.satisfied,
      succeededBranches: input.succeededBranches,
      terminalBranches: input.terminalBranches,
      requiredBranches: input.requiredBranches,
    },
    actor: input.actor,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.node.correlationId,
    causationId: input.causationId,
    occurredAt: input.occurredAt,
  };
}

function nodeAttemptInput(input: {
  instance: WorkflowRuntimeInstanceRecord;
  definition: WorkflowRuntimeNodeDefinition;
  nodeInstanceId: string;
  idempotencyKey: string;
  causationId?: string;
  occurredAt: string;
  maxAttempts?: number;
}): InsertWorkflowNodeAttempt {
  return {
    instanceId: input.instance.instanceId,
    nodeInstanceId: input.nodeInstanceId,
    workflowVersionId: input.instance.workflowVersionId,
    workflowNodeId: input.definition.id,
    nodeKey: input.definition.nodeKey,
    blockType: input.definition.blockType,
    executionKind: executionKind(input.definition.blockType),
    maxAttempts: input.maxAttempts ?? 3,
    input: {},
    idempotencyKey: input.idempotencyKey,
    correlationId: input.instance.correlationId,
    ...(input.causationId ? { causationId: input.causationId } : {}),
    availableAt: input.occurredAt,
  };
}

function mergeInstanceState(record: WorkflowRuntimeInstanceRecord, state: WorkflowInstanceState): WorkflowRuntimeInstanceRecord {
  return { ...record, ...state };
}

function mergeNodeState(record: WorkflowRuntimeNodeRecord, state: WorkflowNodeState): WorkflowRuntimeNodeRecord {
  return { ...record, ...state };
}

function variableAssignmentFromValue(name: string, value: unknown): WorkflowVariableAssignment {
  const dataType = Array.isArray(value)
    ? "array"
    : value === null
      ? "string"
      : typeof value === "boolean"
        ? "boolean"
        : typeof value === "number"
          ? "number"
          : value && typeof value === "object"
            ? "object"
            : "string";
  return {
    name,
    dataType,
    value: dataType === "string" ? String(value ?? "") : value,
    classification: "confidential",
  };
}

function decisionVariableName(nodeKey: string): string {
  const normalized = nodeKey.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return `${normalized || "approval"}_decision`;
}

function stringPayloadValue(payload: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function approvalVoteFromEvent(event: WorkflowEngineEvent): WorkflowApprovalVote | null {
  if (event.eventType !== "workflow.approval.decided") return null;
  const taskId = stringPayloadValue(event.payload, "taskId");
  const nodeKey = stringPayloadValue(event.payload, "nodeKey");
  const workflowRole = stringPayloadValue(event.payload, "workflowRole");
  const decidedByUserId = stringPayloadValue(event.payload, "decidedByUserId");
  const decision = stringPayloadValue(event.payload, "decision");
  if (
    !taskId
    || !nodeKey
    || !workflowRole
    || !decidedByUserId
    || !["approved", "rejected", "returned"].includes(decision ?? "")
  ) {
    return null;
  }
  return {
    taskId,
    nodeKey,
    workflowRole,
    decidedByUserId,
    decision: decision as WorkflowApprovalDecision,
    occurredAt: event.occurredAt,
  };
}

function approvalPolicyFromGraph(
  graph: WorkflowRuntimeGraph,
  approvalGroupId: string,
): WorkflowApprovalPolicy | null {
  const participants: Array<WorkflowApprovalPolicy["participants"][number]> = [];
  let policy: Omit<WorkflowApprovalPolicy, "participants"> | null = null;
  for (const definition of graph.nodes) {
    if (definition.blockType !== "approval") continue;
    const parsed = workflowApprovalConfigurationSchema.safeParse(definition.configuration);
    if (!parsed.success || parsed.data.approvalGroupId !== approvalGroupId) continue;
    policy ??= {
      approvalGroupId,
      mode: parsed.data.approvalMode,
      ...(parsed.data.quorum !== undefined ? { quorum: parsed.data.quorum } : {}),
      uniqueApprovers: parsed.data.uniqueApprovers,
      roleCombination: parsed.data.roleCombination,
      ...(parsed.data.escalationHours !== undefined ? { escalationHours: parsed.data.escalationHours } : {}),
    };
    participants.push({ nodeKey: definition.nodeKey, workflowRole: parsed.data.roleId });
  }
  if (!policy) return null;
  return { ...policy, participants: participants.sort((left, right) => left.nodeKey.localeCompare(right.nodeKey)) };
}

function asJsonValue(value: unknown, label: string): JsonValue {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
    || Array.isArray(value)
    || (value && typeof value === "object")
  ) {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
  }
  throw new WorkflowRuntimeEngineError("invalid_graph", `${label} levert geen JSON-waarde op.`);
}

function stringVariable(variables: Readonly<Record<string, unknown>>, name: string, label: string): string {
  const value = variables[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new WorkflowRuntimeEngineError("invalid_graph", `${label} vereist een gevulde stringvariabele ${name}.`);
  }
  return value;
}

function snapshotIdFromVariable(variables: Readonly<Record<string, unknown>>, variableId: string): string {
  const value = variables[variableId];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WorkflowRuntimeEngineError("invalid_graph", `Snapshotvariabele ${variableId} bevat geen snapshotobject.`);
  }
  const snapshot = (value as Record<string, unknown>)._snapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || typeof (snapshot as Record<string, unknown>).id !== "string") {
    throw new WorkflowRuntimeEngineError("invalid_graph", `Snapshotvariabele ${variableId} mist snapshotmetadata.`);
  }
  return String((snapshot as Record<string, unknown>).id);
}

function workflowChangeIntentFromRecord(record: WorkflowRuntimeChangeIntentRecord): WorkflowChangeIntent {
  const payload = record.payload;
  const values = payload.values && typeof payload.values === "object" && !Array.isArray(payload.values)
    ? payload.values as Record<string, JsonValue>
    : {};
  const rationale = typeof payload.rationale === "string" ? payload.rationale : "";
  return {
    intentVersion: WORKFLOW_CHANGE_INTENT_VERSION,
    resourceId: record.resourceId,
    operation: record.operation,
    values,
    preconditions: record.preconditions as WorkflowChangeIntent["preconditions"],
    idempotencyKey: record.idempotencyKey,
    ...(record.effectiveAt ? { effectiveAt: record.effectiveAt } : {}),
    rationale,
  };
}

function changeIntentStatusFromApplyResult(result: MutationExecutionResult): WorkflowRuntimeChangeIntentStatus {
  if (result.status === "applied") return "applied";
  if (result.status === "rejected") return "rejected";
  if (result.status === "conflicted") return "conflicted";
  return "failed";
}

export class WorkflowRuntimeEngine {
  constructor(
  private readonly store: WorkflowRuntimeStore,
  private readonly reads: Pick<ClientConfigReadService, "search" | "select"> = clientConfigReadService,
    private readonly mutations: WorkflowRuntimeMutationService = new ClientConfigMutationContractService(clientConfigReadService),
  ) {}

  async start(input: StartWorkflowInstanceInput): Promise<WorkflowEngineResult> {
    return this.store.transaction(async (tx) => {
      const graph = await tx.loadPublishedGraph(input.workflowVersionId);
      if (!graph || graph.definitionStatus !== "published") throw new WorkflowRuntimeEngineError("version_not_published", "Alleen een gepubliceerde, actieve workflowversie kan worden gestart.");
      const duplicate = await tx.findInstanceByStartKey(graph.tenant, input.idempotencyKey);
      if (duplicate) return this.duplicateResult(tx, duplicate, input.idempotencyKey);

      const starts = graph.nodes.filter((node) => node.blockType === "manual_start");
      if (starts.length !== 1) throw new WorkflowRuntimeEngineError("invalid_graph", `Een uitvoerbare workflow vereist precies één startnode; gevonden: ${starts.length}.`);
      const instanceId = input.instanceId ?? randomUUID();
      const pending = await tx.insertInstance({
        instanceId,
        workflowVersionId: graph.workflowVersionId,
        tenant: graph.tenant,
        businessUnit: graph.businessUnit,
        clientIds: assertClientScope(graph, input.clientIds),
        idempotencyKey: input.idempotencyKey,
        correlationId: input.correlationId,
        startedByUserId: input.actor.id,
        input: input.input ?? {},
        ...(input.deadlineAt ? { deadlineAt: input.deadlineAt } : {}),
      });
      if (!pending) {
        const raced = await tx.findInstanceByStartKey(graph.tenant, input.idempotencyKey);
        if (!raced) throw new WorkflowRuntimeEngineError("instance_not_found", "De gelijktijdig gestarte instance kon niet worden teruggelezen.");
        return this.duplicateResult(tx, raced, input.idempotencyKey);
      }

      const startCommand: WorkflowRuntimeCommand = {
        type: "start_instance",
        commandId: input.idempotencyKey,
        instanceId,
        expectedStatus: "pending",
        actor: input.actor,
        correlationId: input.correlationId,
        occurredAt: input.occurredAt,
      };
      const started = handleWorkflowRuntimeCommand(pending, startCommand);
      const instance = mergeInstanceState(pending, started.state as WorkflowInstanceState);
      await tx.updateInstance(instance);
      const startEvent = await tx.appendEvent(transitionEvent(started.event));

      if (input.variables?.length) {
        const assignments = validateWorkflowVariableAssignments(input.variables);
        for (const assignment of assignments) {
          await tx.writeVariable({
            id: randomUUID(),
            instanceId,
            assignment,
            idempotencyKey: `${input.idempotencyKey}:variable:${assignment.name}`,
            correlationId: input.correlationId,
          });
        }
      }

      const activationKey = `${input.idempotencyKey}:activate:${starts[0]!.id}`;
      const activated = await tx.insertNodeAttempt(nodeAttemptInput({
        instance,
        definition: starts[0]!,
        nodeInstanceId: randomUUID(),
        idempotencyKey: activationKey,
        causationId: input.idempotencyKey,
        occurredAt: input.occurredAt,
      }));
      const events: WorkflowEngineEvent[] = [startEvent];
      if (activated.created) events.push(await tx.appendEvent(activationEvent({
        instance,
        node: activated.node,
        actor: input.actor,
        idempotencyKey: `${activationKey}:event`,
        causationId: input.idempotencyKey,
        occurredAt: input.occurredAt,
      })));
      return { instance, state: instance, activatedNodes: [activated.node], events, variables: await tx.listVariables(instanceId), deduplicated: false };
    });
  }

  async execute(command: WorkflowRuntimeCommand): Promise<WorkflowEngineResult> {
    return this.store.transaction((tx) => this.executeInTransaction(tx, command));
  }

  async executeParallelGateway(input: Readonly<{
    instanceId: string;
    nodeInstanceId: string;
    commandId: string;
    actor: WorkflowRuntimeActor;
    correlationId: string;
    occurredAt: string;
  }>): Promise<WorkflowEngineResult> {
    return this.store.transaction(async (tx) => {
      const instance = await tx.lockInstance(input.instanceId);
      if (!instance) throw new WorkflowRuntimeEngineError("instance_not_found", "Workflowinstance bestaat niet.");
      const duplicate = await tx.findCommandEvent(input.instanceId, input.commandId);
      if (duplicate) return this.duplicateResult(tx, instance, input.commandId);
      const node = await tx.loadNode(input.nodeInstanceId);
      if (!node || node.instanceId !== input.instanceId) throw new WorkflowRuntimeEngineError("node_not_found", "Parallel gateway bestaat niet binnen deze instance.");
      if (!["parallel_split", "parallel_join"].includes(node.blockType)) {
        throw new WorkflowRuntimeEngineError("invalid_graph", "Alleen parallelle split- en joinnodes kunnen via deze handler worden uitgevoerd.");
      }
      if (node.status === "waiting" && node.blockType === "parallel_join") {
        const graph = await tx.loadPublishedGraph(instance.workflowVersionId);
        const definition = graph?.nodes.find((candidate) => candidate.id === node.workflowNodeId);
        if (!graph || !definition) throw new WorkflowRuntimeEngineError("version_not_published", "De gepinde workflowversie is niet meer beschikbaar.");
        const evaluation = await this.evaluateJoin(tx, instance, definition);
        if (!evaluation.satisfied) {
          return { instance, state: node, activatedNodes: [], events: [], variables: await tx.listVariables(instance.instanceId), deduplicated: false };
        }
        const ready = { ...node, status: "ready" as const, startedAt: undefined, availableAt: input.occurredAt };
        await tx.updateNode(ready);
      }
      const runnable = await tx.loadNode(input.nodeInstanceId);
      if (!runnable || runnable.status !== "running") {
        const started = await this.executeLocked(tx, instance, runnable ?? node, {
          type: "start_node",
          commandId: `${input.commandId}:start`,
          instanceId: input.instanceId,
          nodeInstanceId: input.nodeInstanceId,
          expectedStatus: "ready",
          actor: input.actor,
          correlationId: input.correlationId,
          occurredAt: input.occurredAt,
        });
        const startedNode = await tx.loadNode(input.nodeInstanceId);
        if (!startedNode || startedNode.status !== "running") {
          throw new WorkflowRuntimeEngineError("node_not_found", "Parallel gateway kon na start niet worden herladen.");
        }
        return this.executeLocked(tx, started.instance, startedNode, {
          type: "succeed_node",
          commandId: input.commandId,
          instanceId: input.instanceId,
          nodeInstanceId: input.nodeInstanceId,
          expectedStatus: "running",
          actor: input.actor,
          correlationId: input.correlationId,
          causationId: `${input.commandId}:start`,
          occurredAt: input.occurredAt,
        });
      }
      return this.executeLocked(tx, instance, runnable, {
        type: "succeed_node",
        commandId: input.commandId,
        instanceId: input.instanceId,
        nodeInstanceId: input.nodeInstanceId,
        expectedStatus: "running",
        actor: input.actor,
        correlationId: input.correlationId,
        occurredAt: input.occurredAt,
      });
    });
  }

  async executeClientConfigLookup(input: Readonly<{
    instanceId: string;
    nodeInstanceId: string;
    commandId: string;
    identity: IdentityContext;
    actor: WorkflowRuntimeActor;
    correlationId: string;
    occurredAt: string;
  }>): Promise<WorkflowEngineResult> {
    return this.store.transaction(async (tx) => {
      const instance = await tx.lockInstance(input.instanceId);
      if (!instance) throw new WorkflowRuntimeEngineError("instance_not_found", "Workflowinstance bestaat niet.");
      const duplicate = await tx.findCommandEvent(input.instanceId, input.commandId);
      if (duplicate) return this.duplicateResult(tx, instance, input.commandId);
      const node = await tx.loadNode(input.nodeInstanceId);
      if (!node || node.instanceId !== input.instanceId) throw new WorkflowRuntimeEngineError("node_not_found", "Lookupnode bestaat niet binnen deze instance.");
      if (node.blockType !== "client_config_lookup") throw new WorkflowRuntimeEngineError("invalid_graph", "Alleen client-configlookupnodes kunnen via deze handler worden uitgevoerd.");
      if (node.status !== "running") throw new WorkflowRuntimeEngineError("instance_not_runnable", "Een lookupnode moet eerst geclaimd en gestart zijn.");

      const graph = await tx.loadPublishedGraph(instance.workflowVersionId);
      const definition = graph?.nodes.find((candidate) => candidate.id === node.workflowNodeId);
      if (!graph || !definition) throw new WorkflowRuntimeEngineError("version_not_published", "De gepinde workflowversie is niet meer beschikbaar.");
      const parsed = workflowLookupConfigurationSchema.safeParse(definition.configuration);
      if (!parsed.success) {
        throw new WorkflowRuntimeEngineError("invalid_graph", `Lookupconfiguratie is ongeldig: ${parsed.error.issues.map((issue) => issue.message).join(" ")}`);
      }

      const variables = workflowVariableValues(await tx.listVariables(instance.instanceId));
      const filters = parsed.data.filters.map((filter) => ({
        attributeId: filter.attributeId,
        value: filter.source === "literal" ? filter.value : lookupJsonValue(variables, filter.variableId),
      }));
      if (parsed.data.parentBinding?.mode === "attribute") {
        filters.push({
          attributeId: parsed.data.parentBinding.targetAttributeId,
          value: lookupJsonValue(variables, parsed.data.parentBinding.sourceVariable, parsed.data.parentBinding.targetAttributeId),
        });
      }
      const lookupClientIds = parsed.data.parentBinding?.mode === "scope_client"
        ? lookupClientScope(variables, parsed.data.parentBinding.sourceVariable, instance.clientIds)
        : instance.clientIds;
      const scope = {
        tenant: instance.tenant,
        businessUnit: instance.businessUnit,
        ...(lookupClientIds ? { clientIds: lookupClientIds } : {}),
      };
      const requestedFields = parsed.data.displayFields.length > 0 ? parsed.data.displayFields : undefined;
      const records = filters.length > 0
        ? await this.reads.select({
          identity: input.identity,
          scope,
          resourceId: parsed.data.resourceId,
          filters,
          fields: requestedFields,
          limit: parsed.data.selection === "one" ? 2 : 100,
        })
        : await this.reads.search({
          identity: input.identity,
          scope,
          resourceId: parsed.data.resourceId,
          fields: requestedFields,
          limit: parsed.data.selection === "one" ? 2 : 100,
        });
      if (parsed.data.selection === "one" && records.length !== 1) {
        throw new WorkflowRuntimeEngineError("lookup_failed", `Lookup ${node.nodeKey} verwacht precies één record, maar vond ${records.length}.`);
      }

      const writtenSnapshots: WorkflowRuntimeSnapshotRecord[] = [];
      for (const [index, record] of records.entries()) {
        const written = await tx.writeDataSnapshot({
          id: randomUUID(),
          instanceId: instance.instanceId,
          sourceNodeInstanceId: node.nodeInstanceId,
          snapshot: snapshotFromReadRecord(record, input.occurredAt),
          idempotencyKey: `${input.commandId}:snapshot:${index}:${record.resourceId}:${record.sourceRecordId}`,
          correlationId: input.correlationId,
          causationId: input.commandId,
        });
        writtenSnapshots.push(written.snapshot);
      }
      const outputValue = parsed.data.selection === "one"
        ? lookupVariableValue(writtenSnapshots[0]!)
        : writtenSnapshots.map(lookupVariableValue);
      const result = await this.executeLocked(tx, instance, node, {
        type: "succeed_node",
        commandId: input.commandId,
        instanceId: input.instanceId,
        nodeInstanceId: input.nodeInstanceId,
        expectedStatus: "running",
        actor: input.actor,
        correlationId: input.correlationId,
        occurredAt: input.occurredAt,
        outputVariables: [{
          name: parsed.data.outputVariable,
          dataType: parsed.data.selection === "one" ? "object" : "array",
          value: outputValue,
          classification: "confidential",
        }],
      });
      const snapshotEvent = await tx.appendEvent({
        instanceId: instance.instanceId,
        nodeInstanceId: node.nodeInstanceId,
        eventType: "workflow.lookup.snapshotted",
        eventVersion: 1,
        payload: {
          nodeKey: node.nodeKey,
          resourceId: parsed.data.resourceId,
          outputVariable: parsed.data.outputVariable,
          selection: parsed.data.selection,
          snapshotIds: writtenSnapshots.map((snapshot) => snapshot.id),
          sourceRecordIds: writtenSnapshots.map((snapshot) => snapshot.sourceRecordId),
        },
        actor: input.actor,
        idempotencyKey: `${input.commandId}:snapshots-event`,
        correlationId: input.correlationId,
        causationId: input.commandId,
        occurredAt: input.occurredAt,
      });
      return { ...result, events: [...result.events, snapshotEvent], variables: await tx.listVariables(instance.instanceId) };
    });
  }

  async executeDecision(input: Readonly<{
    instanceId: string;
    nodeInstanceId: string;
    commandId: string;
    actor: WorkflowRuntimeActor;
    correlationId: string;
    occurredAt: string;
  }>): Promise<WorkflowEngineResult> {
    return this.store.transaction(async (tx) => {
      const instance = await tx.lockInstance(input.instanceId);
      if (!instance) throw new WorkflowRuntimeEngineError("instance_not_found", "Workflowinstance bestaat niet.");
      const duplicate = await tx.findCommandEvent(input.instanceId, input.commandId);
      if (duplicate) return this.duplicateResult(tx, instance, input.commandId);
      const node = await tx.loadNode(input.nodeInstanceId);
      if (!node || node.instanceId !== input.instanceId) throw new WorkflowRuntimeEngineError("node_not_found", "Beslissingsnode bestaat niet binnen deze instance.");
      if (node.blockType !== "decision") throw new WorkflowRuntimeEngineError("invalid_graph", "Alleen decision-nodes kunnen via deze handler worden uitgevoerd.");
      if (node.status !== "running") throw new WorkflowRuntimeEngineError("instance_not_runnable", "Een beslissingsnode moet eerst geclaimd en gestart zijn.");

      const graph = await tx.loadPublishedGraph(instance.workflowVersionId);
      const definition = graph?.nodes.find((candidate) => candidate.id === node.workflowNodeId);
      if (!graph || !definition) throw new WorkflowRuntimeEngineError("version_not_published", "De gepinde workflowversie is niet meer beschikbaar.");
      const parsed = workflowDecisionConfigurationSchema.safeParse(definition.configuration);
      if (!parsed.success) {
        throw new WorkflowRuntimeEngineError("invalid_graph", `Beslissingsconfiguratie is ongeldig: ${parsed.error.issues.map((issue) => issue.message).join(" ")}`);
      }

      const variables = await tx.listVariables(instance.instanceId);
      const evaluation = evaluateWorkflowRuntimeExpression(parsed.data.rule, variables, {
        nodeInstanceId: node.nodeInstanceId,
      });
      if (!evaluation.valid) throw new WorkflowVariableRuntimeError(evaluation.issues);
      const outputPort = evaluation.matched ? "matched" : "otherwise";
      const candidateEdges = await tx.listOutgoingEdges(instance.workflowVersionId, node.workflowNodeId, outputPort);
      if (candidateEdges.length === 0) {
        throw new WorkflowRuntimeEngineError("decision_route_not_found", `Beslissing ${node.nodeKey} heeft geen route voor output ${outputPort}.`);
      }
      if (candidateEdges.length > 1) {
        throw new WorkflowRuntimeEngineError("decision_route_ambiguous", `Beslissing ${node.nodeKey} heeft meerdere routes voor output ${outputPort}.`);
      }

      const result = await this.executeLocked(tx, instance, node, {
        type: "succeed_node",
        commandId: input.commandId,
        instanceId: input.instanceId,
        nodeInstanceId: input.nodeInstanceId,
        expectedStatus: "running",
        actor: input.actor,
        correlationId: input.correlationId,
        occurredAt: input.occurredAt,
        selectedOutputPort: outputPort,
        output: {
          matched: evaluation.matched,
          outputPort,
          explanation: evaluation.explanation,
        },
      });
      const decisionEvent = await tx.appendEvent({
        instanceId: instance.instanceId,
        nodeInstanceId: node.nodeInstanceId,
        eventType: "workflow.decision.evaluated",
        eventVersion: 1,
        payload: {
          nodeKey: node.nodeKey,
          label: parsed.data.label,
          matched: evaluation.matched,
          outputPort,
          explanation: evaluation.explanation,
          inputs: evaluation.inputs,
          chosenEdgeId: candidateEdges[0]!.id,
          activatedNodeIds: result.activatedNodes.map((activated) => activated.workflowNodeId),
        },
        actor: input.actor,
        idempotencyKey: `${input.commandId}:decision-event`,
        correlationId: input.correlationId,
        causationId: input.commandId,
        occurredAt: input.occurredAt,
      });
      return { ...result, events: [...result.events, decisionEvent], variables: await tx.listVariables(instance.instanceId) };
    });
  }

  async executeChangeRequest(input: Readonly<{
    instanceId: string;
    nodeInstanceId: string;
    commandId: string;
    identity: IdentityContext;
    actor: WorkflowRuntimeActor;
    correlationId: string;
    occurredAt: string;
  }>): Promise<WorkflowEngineResult> {
    return this.store.transaction(async (tx) => {
      const instance = await tx.lockInstance(input.instanceId);
      if (!instance) throw new WorkflowRuntimeEngineError("instance_not_found", "Workflowinstance bestaat niet.");
      const duplicate = await tx.findCommandEvent(input.instanceId, input.commandId);
      if (duplicate) return this.duplicateResult(tx, instance, input.commandId);
      const node = await tx.loadNode(input.nodeInstanceId);
      if (!node || node.instanceId !== input.instanceId) throw new WorkflowRuntimeEngineError("node_not_found", "Change-requestnode bestaat niet binnen deze instance.");
      if (node.blockType !== "change_request") throw new WorkflowRuntimeEngineError("invalid_graph", "Alleen change_request-nodes kunnen een wijzigingsintentie materialiseren.");
      if (node.status !== "running") throw new WorkflowRuntimeEngineError("instance_not_runnable", "Een change-requestnode moet eerst geclaimd en gestart zijn.");

      const graph = await tx.loadPublishedGraph(instance.workflowVersionId);
      const definition = graph?.nodes.find((candidate) => candidate.id === node.workflowNodeId);
      if (!graph || !definition) throw new WorkflowRuntimeEngineError("version_not_published", "De gepinde workflowversie is niet meer beschikbaar.");
      const parsed = workflowChangeRequestConfigurationSchema.safeParse(definition.configuration);
      if (!parsed.success) {
        throw new WorkflowRuntimeEngineError("invalid_graph", `Change-requestconfiguratie is ongeldig: ${parsed.error.issues.map((issue) => issue.message).join(" ")}`);
      }

      const variables = workflowVariableValues(await tx.listVariables(instance.instanceId));
      const values: Record<string, JsonValue> = {};
      const expectedValues: Record<string, JsonValue> = {};
      let snapshot: WorkflowRuntimeSnapshotRecord | undefined;
      for (const mapping of parsed.data.attributeMappings) {
        if (mapping.soll) values[mapping.attributeId] = asJsonValue(variables[mapping.soll.variableId], `SOLL-mapping ${mapping.attributeId}`);
        if (mapping.ist) {
          const snapshotId = snapshotIdFromVariable(variables, mapping.ist.snapshotVariableId);
          const loaded = await tx.loadDataSnapshot(instance.instanceId, snapshotId);
          if (!loaded) throw new WorkflowRuntimeEngineError("invalid_graph", `Snapshot ${snapshotId} bestaat niet binnen deze instance.`);
          if (snapshot && snapshot.id !== loaded.id) throw new WorkflowRuntimeEngineError("invalid_graph", "Eén change_request-node mag in deze runtimeversie maar één bronsnapshot gebruiken.");
          snapshot = loaded;
          expectedValues[mapping.attributeId] = asJsonValue(loaded.selectedFields[mapping.ist.snapshotAttributeId], `IST-precondition ${mapping.attributeId}`);
          if (parsed.data.operation === "RETIRE") values[mapping.attributeId] = expectedValues[mapping.attributeId]!;
        }
      }

      const intent: WorkflowChangeIntent = {
        intentVersion: WORKFLOW_CHANGE_INTENT_VERSION,
        resourceId: parsed.data.resourceId,
        operation: parsed.data.operation,
        values,
        preconditions: {
          ...(snapshot ? { snapshot: {
            snapshotVersion: snapshot.snapshotVersion as 1,
            resourceId: snapshot.resourceId,
            sourceRecordId: snapshot.sourceRecordId,
            selectedFields: snapshot.selectedFields,
            concurrencyToken: snapshot.concurrencyToken,
            readAt: snapshot.readAt,
          } } : {}),
          ...(Object.keys(expectedValues).length ? { expectedValues } : {}),
        },
        idempotencyKey: input.commandId,
        effectiveAt: stringVariable(variables, parsed.data.effectiveDateVariable, "Ingangsdatum"),
        rationale: stringVariable(variables, parsed.data.rationaleVariable, "Rationale"),
      };
      const scope = {
        tenant: instance.tenant,
        businessUnit: instance.businessUnit,
        ...(instance.clientIds ? { clientIds: instance.clientIds } : {}),
      };
      const dryRun = await this.mutations.dryRun({ identity: input.identity, scope, intent });
      const adapterId = dryRun.adapterId ?? `${intent.resourceId}:${intent.operation}`;
      const execution: MutationExecutionResult | undefined = dryRun.status === "ready"
        ? {
          status: "staged",
          adapterId,
          stagingReference: `${dryRun.stageHandlerId}:${input.commandId}`,
          auditReference: `workflow:${instance.instanceId}:${node.nodeInstanceId}`,
          message: "Workflow change intent is gevalideerd en klaargezet voor het governed stagingpad.",
        }
        : undefined;
      const persisted = await tx.writeChangeIntent({
        id: randomUUID(),
        instanceId: instance.instanceId,
        nodeInstanceId: node.nodeInstanceId,
        ...(snapshot ? { snapshotId: snapshot.id } : {}),
        adapterId,
        resourceId: intent.resourceId,
        operation: intent.operation,
        status: dryRun.status === "ready" ? "validated" : dryRun.status === "conflicted" ? "conflicted" : "failed",
        payload: { values: intent.values, rationale: intent.rationale },
        preconditions: intent.preconditions as unknown as Record<string, unknown>,
        dryRunResult: dryRun,
        ...(execution ? { applyResult: execution } : {}),
        idempotencyKey: input.commandId,
        correlationId: input.correlationId,
        causationId: input.commandId,
        effectiveAt: intent.effectiveAt,
      });
      const intentEvent = await tx.appendEvent({
        instanceId: instance.instanceId,
        nodeInstanceId: node.nodeInstanceId,
        eventType: "workflow.change_intent.materialized",
        eventVersion: 1,
        payload: {
          intentId: persisted.intent.id,
          nodeKey: node.nodeKey,
          adapterId,
          resourceId: intent.resourceId,
          operation: intent.operation,
          status: persisted.intent.status,
          dryRunStatus: dryRun.status,
          stageHandlerId: dryRun.stageHandlerId,
          stagingReference: execution?.stagingReference,
          snapshotId: snapshot?.id,
          issueCodes: dryRun.issues.map((issue) => issue.code),
        },
        actor: input.actor,
        idempotencyKey: `${input.commandId}:intent-event`,
        correlationId: input.correlationId,
        causationId: input.commandId,
        occurredAt: input.occurredAt,
      });
      if (dryRun.status !== "ready") {
        return { instance, state: node, activatedNodes: [], events: [intentEvent], variables: await tx.listVariables(instance.instanceId), deduplicated: false };
      }
      const result = await this.executeLocked(tx, instance, node, {
        type: "succeed_node",
        commandId: input.commandId,
        instanceId: input.instanceId,
        nodeInstanceId: input.nodeInstanceId,
        expectedStatus: "running",
        actor: input.actor,
        correlationId: input.correlationId,
        occurredAt: input.occurredAt,
        output: {
          intentId: persisted.intent.id,
          adapterId,
          resourceId: intent.resourceId,
          operation: intent.operation,
          stagingReference: execution?.stagingReference,
        },
      });
      return { ...result, events: [intentEvent, ...result.events], variables: await tx.listVariables(instance.instanceId) };
    });
  }

  async applyChangeIntent(input: Readonly<{
    instanceId: string;
    intentId: string;
    commandId: string;
    identity: IdentityContext;
    actor: WorkflowRuntimeActor;
    correlationId: string;
    occurredAt: string;
  }>): Promise<WorkflowEngineResult> {
    return this.store.transaction(async (tx) => {
      const instance = await tx.lockInstance(input.instanceId);
      if (!instance) throw new WorkflowRuntimeEngineError("instance_not_found", "Workflowinstance bestaat niet.");
      const duplicate = await tx.findCommandEvent(input.instanceId, input.commandId);
      if (duplicate) return this.duplicateResult(tx, instance, input.commandId);

      const record = await tx.loadChangeIntent(input.instanceId, input.intentId);
      if (!record) throw new WorkflowRuntimeEngineError("node_not_found", "Change intent bestaat niet binnen deze instance.");
      if (!["validated", "approved"].includes(record.status)) {
        throw new WorkflowRuntimeEngineError("instance_not_runnable", "Alleen gevalideerde of goedgekeurde change intents kunnen worden toegepast.");
      }
      const node = await tx.loadNode(record.nodeInstanceId);
      if (!node || node.instanceId !== input.instanceId) throw new WorkflowRuntimeEngineError("node_not_found", "De change-requestnode van deze intent bestaat niet meer.");

      const intent = workflowChangeIntentFromRecord(record);
      const scope = {
        tenant: instance.tenant,
        businessUnit: instance.businessUnit,
        ...(instance.clientIds ? { clientIds: instance.clientIds } : {}),
      };
      const finalDryRun = await this.mutations.dryRun({ identity: input.identity, scope, intent });
      const adapterId = finalDryRun.adapterId ?? record.adapterId;
      if (finalDryRun.status !== "ready") {
        const applyResult: MutationExecutionResult = {
          status: finalDryRun.status === "conflicted" ? "conflicted" : "failed",
          adapterId,
          auditReference: `workflow:${instance.instanceId}:${record.nodeInstanceId}:${record.id}`,
          errorCode: finalDryRun.issues.map((issue) => issue.code).join(",") || finalDryRun.status,
          message: finalDryRun.status === "conflicted"
            ? "De change intent is niet toegepast omdat de brondata sinds de snapshot is gewijzigd. Herlaad de gegevens en laat de wijziging opnieuw goedkeuren."
            : "De change intent is niet toegepast omdat de laatste contractcontrole faalde.",
        };
        const updated = await tx.updateChangeIntentApplyResult({
          instanceId: instance.instanceId,
          intentId: record.id,
          status: applyResult.status === "conflicted" ? "conflicted" : "failed",
          dryRunResult: finalDryRun,
          applyResult,
        });
        const event = await tx.appendEvent({
          instanceId: instance.instanceId,
          nodeInstanceId: record.nodeInstanceId,
          eventType: "workflow.change_intent.apply_blocked",
          eventVersion: 1,
          payload: {
            intentId: record.id,
            adapterId,
            status: updated.status,
            dryRunStatus: finalDryRun.status,
            issueCodes: finalDryRun.issues.map((issue) => issue.code),
            requiresReloadAndReapproval: finalDryRun.status === "conflicted",
          },
          actor: input.actor,
          idempotencyKey: input.commandId,
          correlationId: input.correlationId,
          causationId: record.idempotencyKey,
          occurredAt: input.occurredAt,
        });
        return { instance, state: node, activatedNodes: [], events: [event], variables: await tx.listVariables(instance.instanceId), deduplicated: false };
      }

      const applyResult = this.mutations.apply
        ? await this.mutations.apply({
          identity: input.identity,
          scope,
          intent,
          dryRun: finalDryRun,
          runtime: {
            workflowInstanceId: instance.instanceId,
            workflowVersionId: instance.workflowVersionId,
            workflowNodeInstanceId: record.nodeInstanceId,
            changeIntentId: record.id,
            actor: input.actor,
            correlationId: input.correlationId,
            causationId: record.idempotencyKey,
            occurredAt: input.occurredAt,
          },
        })
        : {
          status: "failed" as const,
          adapterId,
          auditReference: `workflow:${instance.instanceId}:${record.nodeInstanceId}:${record.id}`,
          errorCode: "apply_adapter_missing",
          message: "Er is geen mutation apply-adapter geregistreerd voor deze runtime.",
        };
      const updated = await tx.updateChangeIntentApplyResult({
        instanceId: instance.instanceId,
        intentId: record.id,
        status: changeIntentStatusFromApplyResult(applyResult),
        dryRunResult: finalDryRun,
        applyResult,
        approvedByUserId: input.actor.type === "user" ? input.actor.id : undefined,
        approvedAt: input.occurredAt,
        appliedAt: applyResult.status === "applied" ? input.occurredAt : undefined,
      });
      const event = await tx.appendEvent({
        instanceId: instance.instanceId,
        nodeInstanceId: record.nodeInstanceId,
        eventType: applyResult.status === "applied" ? "workflow.change_intent.applied" : "workflow.change_intent.apply_failed",
        eventVersion: 1,
        payload: {
          intentId: record.id,
          adapterId,
          status: updated.status,
          applyStatus: applyResult.status,
          appliedResourceId: applyResult.appliedResourceId,
          auditReference: applyResult.auditReference,
          errorCode: applyResult.errorCode,
        },
        actor: input.actor,
        idempotencyKey: input.commandId,
        correlationId: input.correlationId,
        causationId: record.idempotencyKey,
        occurredAt: input.occurredAt,
      });
      return { instance, state: node, activatedNodes: [], events: [event], variables: await tx.listVariables(instance.instanceId), deduplicated: false };
    });
  }

  async executeNotification(input: Readonly<{
    instanceId: string;
    nodeInstanceId: string;
    commandId: string;
    actor: WorkflowRuntimeActor;
    correlationId: string;
    occurredAt: string;
  }>): Promise<WorkflowEngineResult> {
    return this.store.transaction(async (tx) => {
      const instance = await tx.lockInstance(input.instanceId);
      if (!instance) throw new WorkflowRuntimeEngineError("instance_not_found", "Workflowinstance bestaat niet.");
      const duplicate = await tx.findCommandEvent(input.instanceId, input.commandId);
      if (duplicate) return this.duplicateResult(tx, instance, input.commandId);
      const node = await tx.loadNode(input.nodeInstanceId);
      if (!node || node.instanceId !== input.instanceId) throw new WorkflowRuntimeEngineError("node_not_found", "Notificatienode bestaat niet binnen deze instance.");
      if (node.blockType !== "notification") throw new WorkflowRuntimeEngineError("invalid_graph", "Alleen notification-nodes kunnen via deze handler worden uitgevoerd.");
      if (node.status !== "running") throw new WorkflowRuntimeEngineError("instance_not_runnable", "Een notificatienode moet eerst geclaimd en gestart zijn.");

      const graph = await tx.loadPublishedGraph(instance.workflowVersionId);
      const definition = graph?.nodes.find((candidate) => candidate.id === node.workflowNodeId);
      if (!graph || !definition) throw new WorkflowRuntimeEngineError("version_not_published", "De gepinde workflowversie is niet meer beschikbaar.");
      const parsed = workflowNotificationConfigurationSchema.safeParse(definition.configuration);
      if (!parsed.success) {
        throw new WorkflowRuntimeEngineError("invalid_graph", `Notificatieconfiguratie is ongeldig: ${parsed.error.issues.map((issue) => issue.message).join(" ")}`);
      }

      const recipientBindings: WorkflowRuntimeRoleBindingRecord[] = [];
      for (const roleId of parsed.data.recipientRoleIds) {
        const binding = await tx.findRoleBinding(instance.workflowVersionId, roleId, "workflow:tasks:execute")
          ?? await tx.findRoleBinding(instance.workflowVersionId, roleId, "workflow:approve");
        if (!binding) throw new WorkflowRuntimeEngineError("invalid_graph", `Geen notificatie-rolbinding gevonden voor workflowrol ${roleId}.`);
        recipientBindings.push(binding);
      }

      const variables = workflowVariableValues(await tx.listVariables(instance.instanceId));
      const rendered = renderWorkflowNotification(parsed.data, variables);
      if (!rendered.valid) {
        throw new WorkflowRuntimeEngineError("invalid_graph", `Notificatie kon niet veilig worden gerenderd: ${rendered.issues.map((issue) => issue.message).join(" ")}`);
      }
      const recipients = recipientBindings.map((binding) => ({
        workflowRole: binding.workflowRole,
        identityGroup: binding.identityGroup,
        permissions: binding.permissions,
      }));
      const outbox = await tx.enqueueOutbox({
        id: randomUUID(),
        workflowInstanceId: instance.instanceId,
        workflowNodeInstanceId: node.nodeInstanceId,
        kind: "notification",
        target: parsed.data.channel,
        payload: {
          workflowInstanceId: instance.instanceId,
          workflowVersionId: instance.workflowVersionId,
          workflowNodeInstanceId: node.nodeInstanceId,
          nodeKey: node.nodeKey,
          channel: parsed.data.channel,
          trigger: parsed.data.trigger,
          subject: rendered.subject,
          message: rendered.message,
          usedVariables: rendered.usedVariables,
          recipients,
          links: {
            instance: `/workflow-runtime/${instance.instanceId}`,
          },
        },
        idempotencyKey: `${input.commandId}:notification:${parsed.data.channel}`,
        correlationId: input.correlationId,
        causationId: input.commandId,
        availableAt: input.occurredAt,
      });
      const notificationEvent = await tx.appendEvent({
        instanceId: instance.instanceId,
        nodeInstanceId: node.nodeInstanceId,
        eventType: "workflow.notification.queued",
        eventVersion: 1,
        payload: {
          nodeKey: node.nodeKey,
          channel: parsed.data.channel,
          trigger: parsed.data.trigger,
          outboxMessageId: outbox.message.id,
          recipientRoles: recipients.map((recipient) => recipient.workflowRole),
          recipientGroups: recipients.map((recipient) => recipient.identityGroup),
          subject: rendered.subject,
          created: outbox.created,
          blocking: false,
        },
        actor: input.actor,
        idempotencyKey: `${input.commandId}:notification-event`,
        correlationId: input.correlationId,
        causationId: input.commandId,
        occurredAt: input.occurredAt,
      });
      const result = await this.executeLocked(tx, instance, node, {
        type: "succeed_node",
        commandId: input.commandId,
        instanceId: input.instanceId,
        nodeInstanceId: input.nodeInstanceId,
        expectedStatus: "running",
        actor: input.actor,
        correlationId: input.correlationId,
        occurredAt: input.occurredAt,
        output: {
          outboxMessageId: outbox.message.id,
          channel: parsed.data.channel,
          recipientRoles: recipients.map((recipient) => recipient.workflowRole),
        },
      });
      return { ...result, events: [notificationEvent, ...result.events], variables: await tx.listVariables(instance.instanceId) };
    });
  }

  async executeIntegration(input: Readonly<{
    instanceId: string;
    nodeInstanceId: string;
    commandId: string;
    actor: WorkflowRuntimeActor;
    correlationId: string;
    occurredAt: string;
  }>): Promise<WorkflowEngineResult> {
    return this.store.transaction(async (tx) => {
      const instance = await tx.lockInstance(input.instanceId);
      if (!instance) throw new WorkflowRuntimeEngineError("instance_not_found", "Workflowinstance bestaat niet.");
      const duplicate = await tx.findCommandEvent(input.instanceId, input.commandId);
      if (duplicate) return this.duplicateResult(tx, instance, input.commandId);
      const node = await tx.loadNode(input.nodeInstanceId);
      if (!node || node.instanceId !== input.instanceId) throw new WorkflowRuntimeEngineError("node_not_found", "Integratienode bestaat niet binnen deze instance.");
      if (node.blockType !== "integration") throw new WorkflowRuntimeEngineError("invalid_graph", "Alleen integration-nodes kunnen via deze handler worden uitgevoerd.");
      if (node.status !== "running") throw new WorkflowRuntimeEngineError("instance_not_runnable", "Een integratienode moet eerst geclaimd en gestart zijn.");

      const graph = await tx.loadPublishedGraph(instance.workflowVersionId);
      const definition = graph?.nodes.find((candidate) => candidate.id === node.workflowNodeId);
      if (!graph || !definition) throw new WorkflowRuntimeEngineError("version_not_published", "De gepinde workflowversie is niet meer beschikbaar.");
      const parsed = workflowIntegrationConfigurationSchema.safeParse(definition.configuration);
      if (!parsed.success) {
        throw new WorkflowRuntimeEngineError("invalid_graph", `Integratieconfiguratie is ongeldig: ${parsed.error.issues.map((issue) => issue.message).join(" ")}`);
      }

      const variables = workflowVariableValues(await tx.listVariables(instance.instanceId));
      const missing = parsed.data.inputVariables.filter((variable) => variables[variable] === undefined);
      if (missing.length > 0) {
        throw new WorkflowRuntimeEngineError("invalid_graph", `Integratie-inputvariabelen ontbreken: ${missing.join(", ")}.`);
      }
      const integrationInput = Object.fromEntries(parsed.data.inputVariables.map((variable) => [variable, variables[variable]]));
      const secretReferences = parsed.data.secretRefs.map((entry) => ({ name: entry.name, secretRef: entry.secretRef }));
      const outbox = await tx.enqueueOutbox({
        id: randomUUID(),
        workflowInstanceId: instance.instanceId,
        workflowNodeInstanceId: node.nodeInstanceId,
        kind: "integration",
        target: parsed.data.connectorId,
        payload: {
          workflowInstanceId: instance.instanceId,
          workflowVersionId: instance.workflowVersionId,
          workflowNodeInstanceId: node.nodeInstanceId,
          nodeKey: node.nodeKey,
          connectorId: parsed.data.connectorId,
          connectorVersion: parsed.data.connectorVersion,
          operation: parsed.data.operation,
          inputSchemaVersion: parsed.data.inputSchemaVersion,
          outputSchemaVersion: parsed.data.outputSchemaVersion,
          input: integrationInput,
          secretReferences,
          timeoutMs: parsed.data.timeoutMs,
          retryPolicy: parsed.data.retryPolicy,
          signing: parsed.data.signing,
          sandboxMode: parsed.data.sandboxMode,
          idempotency: {
            commandId: input.commandId,
            ...(parsed.data.outputVariable ? { outputVariable: parsed.data.outputVariable } : {}),
          },
        },
        idempotencyKey: `${input.commandId}:integration:${parsed.data.connectorId}`,
        correlationId: input.correlationId,
        causationId: input.commandId,
        maxAttempts: parsed.data.retryPolicy.maxAttempts,
        availableAt: input.occurredAt,
      });
      const integrationEvent = await tx.appendEvent({
        instanceId: instance.instanceId,
        nodeInstanceId: node.nodeInstanceId,
        eventType: "workflow.integration.queued",
        eventVersion: 1,
        payload: {
          nodeKey: node.nodeKey,
          connectorId: parsed.data.connectorId,
          connectorVersion: parsed.data.connectorVersion,
          operation: parsed.data.operation,
          outboxMessageId: outbox.message.id,
          inputVariables: parsed.data.inputVariables,
          secretReferenceNames: secretReferences.map((entry) => entry.name),
          timeoutMs: parsed.data.timeoutMs,
          maxAttempts: parsed.data.retryPolicy.maxAttempts,
          signingMode: parsed.data.signing.mode,
          sandboxMode: parsed.data.sandboxMode,
          created: outbox.created,
        },
        actor: input.actor,
        idempotencyKey: `${input.commandId}:integration-event`,
        correlationId: input.correlationId,
        causationId: input.commandId,
        occurredAt: input.occurredAt,
      });
      const output = {
        outboxMessageId: outbox.message.id,
        connectorId: parsed.data.connectorId,
        sandboxMode: parsed.data.sandboxMode,
      };
      const result = await this.executeLocked(tx, instance, node, {
        type: "succeed_node",
        commandId: input.commandId,
        instanceId: input.instanceId,
        nodeInstanceId: input.nodeInstanceId,
        expectedStatus: "running",
        actor: input.actor,
        correlationId: input.correlationId,
        occurredAt: input.occurredAt,
        output,
        outputVariables: parsed.data.outputVariable
          ? [{ name: parsed.data.outputVariable, dataType: "object", value: output, classification: "confidential" }]
          : [],
      });
      return { ...result, events: [integrationEvent, ...result.events], variables: await tx.listVariables(instance.instanceId) };
    });
  }

  async claimNext(input: Readonly<{
    instanceId: string;
    commandId: string;
    workerId: string;
    leaseDurationMs: number;
    actor?: WorkflowRuntimeActor;
    correlationId: string;
    occurredAt: string;
  }>): Promise<WorkflowEngineResult | null> {
    return this.store.transaction(async (tx) => {
      const instance = await tx.lockInstance(input.instanceId);
      if (!instance) throw new WorkflowRuntimeEngineError("instance_not_found", "Workflowinstance bestaat niet.");
      const duplicate = await tx.findCommandEvent(input.instanceId, input.commandId);
      if (duplicate) return this.duplicateResult(tx, instance, input.commandId);
      const node = await tx.findRunnableNode(input.instanceId, input.occurredAt);
      if (!node) return null;
      if (!Number.isFinite(input.leaseDurationMs) || input.leaseDurationMs <= 0) {
        throw new WorkflowRuntimeEngineError("invalid_graph", "LeaseDurationMs moet positief zijn.");
      }
      return this.executeLocked(tx, instance, node, {
        type: "start_node",
        commandId: input.commandId,
        instanceId: input.instanceId,
        nodeInstanceId: node.nodeInstanceId,
        expectedStatus: "ready",
        actor: input.actor ?? { type: "system", id: input.workerId },
        correlationId: input.correlationId,
        occurredAt: input.occurredAt,
        leaseOwner: input.workerId,
        leaseExpiresAt: new Date(Date.parse(input.occurredAt) + input.leaseDurationMs).toISOString(),
      });
    });
  }

  async createRoleTask(input: Readonly<{
    instanceId: string;
    nodeInstanceId: string;
    commandId: string;
    actor: WorkflowRuntimeActor;
    correlationId: string;
    occurredAt: string;
  }>): Promise<WorkflowTaskWriteResult> {
    return this.store.transaction(async (tx) => {
      const instance = await tx.lockInstance(input.instanceId);
      if (!instance) throw new WorkflowRuntimeEngineError("instance_not_found", "Workflowinstance bestaat niet.");
      const node = await tx.loadNode(input.nodeInstanceId);
      if (!node || node.instanceId !== input.instanceId) throw new WorkflowRuntimeEngineError("node_not_found", "Roltaaknode bestaat niet binnen deze instance.");
      if (node.blockType !== "role_task") throw new WorkflowRuntimeEngineError("invalid_graph", "Alleen role_task-nodes kunnen een roltaak materialiseren.");
      if (node.status !== "running") throw new WorkflowRuntimeEngineError("instance_not_runnable", "Een roltaaknode moet gestart zijn voordat de taak kan worden gemaakt.");
      const graph = await tx.loadPublishedGraph(instance.workflowVersionId);
      const definition = graph?.nodes.find((candidate) => candidate.id === node.workflowNodeId);
      if (!graph || !definition) throw new WorkflowRuntimeEngineError("version_not_published", "De gepinde workflowversie is niet meer beschikbaar.");
      const parsed = workflowRoleTaskConfigurationSchema.safeParse(definition.configuration);
      if (!parsed.success) {
        throw new WorkflowRuntimeEngineError("invalid_graph", `Roltaakconfiguratie is ongeldig: ${parsed.error.issues.map((issue) => issue.message).join(" ")}`);
      }
      const binding = await tx.findRoleBinding(instance.workflowVersionId, parsed.data.roleId, "workflow:tasks:execute");
      if (!binding) throw new WorkflowRuntimeEngineError("invalid_graph", `Geen uitvoerbare rolbinding gevonden voor workflowrol ${parsed.data.roleId}.`);
      const deadlinePolicy = parsed.data.deadlineHours
        ? calculateWorkflowBusinessDeadline({
          startedAt: input.occurredAt,
          durationHours: parsed.data.deadlineHours,
          ...(parsed.data.deadlineCalendar ? { calendar: parsed.data.deadlineCalendar } : {}),
        })
        : undefined;
      const written = await tx.writeTask({
        id: randomUUID(),
        instanceId: instance.instanceId,
        workflowVersionId: instance.workflowVersionId,
        nodeInstanceId: node.nodeInstanceId,
        roleBindingId: binding.id,
        title: parsed.data.title,
        instructions: parsed.data.instructions,
        assigneeGroup: binding.identityGroup,
        idempotencyKey: input.commandId,
        correlationId: input.correlationId,
        causationId: input.commandId,
        ...(deadlinePolicy ? { deadlineAt: deadlinePolicy.deadlineAt } : {}),
      });
      if (written.created) {
        await tx.appendEvent({
          instanceId: instance.instanceId,
          nodeInstanceId: node.nodeInstanceId,
          eventType: "workflow.task.created",
          eventVersion: 1,
          payload: {
            taskId: written.task.id,
            nodeKey: node.nodeKey,
            workflowRole: binding.workflowRole,
            assigneeGroup: binding.identityGroup,
            title: written.task.title,
            ...(deadlinePolicy ? { deadlinePolicy } : {}),
          },
          actor: input.actor,
          idempotencyKey: `${input.commandId}:event`,
          correlationId: input.correlationId,
          causationId: input.commandId,
          occurredAt: input.occurredAt,
        });
      }
      return written;
    });
  }

  async createApprovalTask(input: Readonly<{
    instanceId: string;
    nodeInstanceId: string;
    commandId: string;
    actor: WorkflowRuntimeActor;
    correlationId: string;
    occurredAt: string;
  }>): Promise<WorkflowTaskWriteResult> {
    return this.store.transaction(async (tx) => {
      const instance = await tx.lockInstance(input.instanceId);
      if (!instance) throw new WorkflowRuntimeEngineError("instance_not_found", "Workflowinstance bestaat niet.");
      const node = await tx.loadNode(input.nodeInstanceId);
      if (!node || node.instanceId !== input.instanceId) throw new WorkflowRuntimeEngineError("node_not_found", "Goedkeuringsnode bestaat niet binnen deze instance.");
      if (node.blockType !== "approval") throw new WorkflowRuntimeEngineError("invalid_graph", "Alleen approval-nodes kunnen een goedkeuringstaak materialiseren.");
      if (node.status !== "running") throw new WorkflowRuntimeEngineError("instance_not_runnable", "Een goedkeuringsnode moet gestart zijn voordat de taak kan worden gemaakt.");
      const graph = await tx.loadPublishedGraph(instance.workflowVersionId);
      const definition = graph?.nodes.find((candidate) => candidate.id === node.workflowNodeId);
      if (!graph || !definition) throw new WorkflowRuntimeEngineError("version_not_published", "De gepinde workflowversie is niet meer beschikbaar.");
      const parsed = workflowApprovalConfigurationSchema.safeParse(definition.configuration);
      if (!parsed.success) {
        throw new WorkflowRuntimeEngineError("invalid_graph", `Goedkeuringsconfiguratie is ongeldig: ${parsed.error.issues.map((issue) => issue.message).join(" ")}`);
      }
      const binding = await tx.findRoleBinding(instance.workflowVersionId, parsed.data.roleId, "workflow:approve");
      if (!binding) throw new WorkflowRuntimeEngineError("invalid_graph", `Geen goedkeuringsrolbinding gevonden voor workflowrol ${parsed.data.roleId}.`);
      const written = await tx.writeTask({
        id: randomUUID(),
        instanceId: instance.instanceId,
        workflowVersionId: instance.workflowVersionId,
        nodeInstanceId: node.nodeInstanceId,
        roleBindingId: binding.id,
        title: parsed.data.title,
        instructions: parsed.data.instructions ?? "",
        assigneeGroup: binding.identityGroup,
        idempotencyKey: input.commandId,
        correlationId: input.correlationId,
        causationId: input.commandId,
      });
      if (written.created) {
        await tx.appendEvent({
          instanceId: instance.instanceId,
          nodeInstanceId: node.nodeInstanceId,
          eventType: "workflow.approval.created",
          eventVersion: 1,
          payload: {
            taskId: written.task.id,
            nodeKey: node.nodeKey,
            workflowRole: binding.workflowRole,
            assigneeGroup: binding.identityGroup,
            title: written.task.title,
          },
          actor: input.actor,
          idempotencyKey: `${input.commandId}:event`,
          correlationId: input.correlationId,
          causationId: input.commandId,
          occurredAt: input.occurredAt,
        });
      }
      return written;
    });
  }

  async completeRoleTask(input: Readonly<{
    taskId: string;
    commandId: string;
    actor: WorkflowRuntimeActor;
    correlationId: string;
    occurredAt: string;
    formData: Readonly<Record<string, unknown>>;
    outputVariables?: readonly WorkflowVariableAssignment[];
    comment?: string;
  }>): Promise<WorkflowEngineResult> {
    return this.store.transaction(async (tx) => {
      const task = await tx.loadTask(input.taskId);
      if (!task) throw new WorkflowRuntimeEngineError("node_not_found", "Workflowtaak bestaat niet.");
      const instance = await tx.lockInstance(task.instanceId);
      if (!instance) throw new WorkflowRuntimeEngineError("instance_not_found", "Workflowinstance bestaat niet.");
      const duplicate = await tx.findCommandEvent(instance.instanceId, input.commandId);
      if (duplicate) return this.duplicateResult(tx, instance, input.commandId);
      const node = await tx.loadNode(task.nodeInstanceId);
      if (!node || node.instanceId !== instance.instanceId) throw new WorkflowRuntimeEngineError("node_not_found", "Roltaaknode bestaat niet binnen deze instance.");
      if (task.status !== "claimed" || task.claimedByUserId !== input.actor.id) {
        throw new WorkflowRuntimeEngineError("instance_not_runnable", "Alleen de huidige claimhouder kan deze taak voltooien.");
      }
      const graph = await tx.loadPublishedGraph(instance.workflowVersionId);
      const definition = graph?.nodes.find((candidate) => candidate.id === node.workflowNodeId);
      if (!graph || !definition) throw new WorkflowRuntimeEngineError("version_not_published", "De gepinde workflowversie is niet meer beschikbaar.");
      const parsed = workflowRoleTaskConfigurationSchema.safeParse(definition.configuration);
      if (!parsed.success) {
        throw new WorkflowRuntimeEngineError("invalid_graph", `Roltaakconfiguratie is ongeldig: ${parsed.error.issues.map((issue) => issue.message).join(" ")}`);
      }
      const outputVariables = input.outputVariables
        ?? parsed.data.outputVariables
          .filter((name) => Object.hasOwn(input.formData, name))
          .map((name) => variableAssignmentFromValue(name, input.formData[name]));
      const updatedTask = await tx.updateTask({
        taskId: task.id,
        status: "completed",
        claimedByUserId: task.claimedByUserId,
        outcome: "completed",
        formData: input.formData,
        ...(input.comment ? { completionComment: input.comment } : {}),
        claimedAt: task.claimedAt,
        completedAt: input.occurredAt,
      });
      const result = await this.executeLocked(tx, instance, node, {
        type: "succeed_node",
        commandId: input.commandId,
        instanceId: instance.instanceId,
        nodeInstanceId: node.nodeInstanceId,
        expectedStatus: "running",
        actor: input.actor,
        correlationId: input.correlationId,
        occurredAt: input.occurredAt,
        output: input.formData,
        outputVariables,
      });
      const taskEvent = await tx.appendEvent({
        instanceId: instance.instanceId,
        nodeInstanceId: node.nodeInstanceId,
        eventType: "workflow.task.completed",
        eventVersion: 1,
        payload: {
          taskId: updatedTask.id,
          nodeKey: node.nodeKey,
          outcome: updatedTask.outcome,
          completedByUserId: input.actor.id,
          outputVariableNames: outputVariables.map((assignment) => assignment.name),
        },
        actor: input.actor,
        idempotencyKey: `${input.commandId}:task-event`,
        correlationId: input.correlationId,
        causationId: input.commandId,
        occurredAt: input.occurredAt,
      });
      return { ...result, events: [...result.events, taskEvent], variables: await tx.listVariables(instance.instanceId) };
    });
  }

  async completeApprovalTask(input: Readonly<{
    taskId: string;
    commandId: string;
    actor: WorkflowRuntimeActor;
    correlationId: string;
    occurredAt: string;
    decision: WorkflowApprovalDecision;
    comment?: string;
  }>): Promise<WorkflowEngineResult> {
    return this.store.transaction(async (tx) => {
      const task = await tx.loadTask(input.taskId);
      if (!task) throw new WorkflowRuntimeEngineError("node_not_found", "Goedkeuringstaak bestaat niet.");
      const instance = await tx.lockInstance(task.instanceId);
      if (!instance) throw new WorkflowRuntimeEngineError("instance_not_found", "Workflowinstance bestaat niet.");
      if (instance.startedByUserId === input.actor.id) {
        throw new WorkflowRuntimeEngineError("maker_checker_conflict", "De aanvrager mag de eigen workflowaanvraag niet goedkeuren.");
      }
      const duplicate = await tx.findCommandEvent(instance.instanceId, input.commandId);
      if (duplicate) return this.duplicateResult(tx, instance, input.commandId);
      const node = await tx.loadNode(task.nodeInstanceId);
      if (!node || node.instanceId !== instance.instanceId) throw new WorkflowRuntimeEngineError("node_not_found", "Goedkeuringsnode bestaat niet binnen deze instance.");
      if (node.blockType !== "approval") throw new WorkflowRuntimeEngineError("invalid_graph", "Alleen approval-nodes kunnen een goedkeuringsbesluit verwerken.");
      if (!task.permissions.includes("workflow:approve")) throw new WorkflowRuntimeEngineError("invalid_graph", "De taakrol heeft geen goedkeuringscapability.");
      if (task.status !== "claimed" || task.claimedByUserId !== input.actor.id) {
        throw new WorkflowRuntimeEngineError("instance_not_runnable", "Alleen de huidige claimhouder kan dit besluit vastleggen.");
      }
      const graph = await tx.loadPublishedGraph(instance.workflowVersionId);
      const definition = graph?.nodes.find((candidate) => candidate.id === node.workflowNodeId);
      if (!graph || !definition) throw new WorkflowRuntimeEngineError("version_not_published", "De gepinde workflowversie is niet meer beschikbaar.");
      const parsed = workflowApprovalConfigurationSchema.safeParse(definition.configuration);
      if (!parsed.success) {
        throw new WorkflowRuntimeEngineError("invalid_graph", `Goedkeuringsconfiguratie is ongeldig: ${parsed.error.issues.map((issue) => issue.message).join(" ")}`);
      }
      const comment = input.comment?.trim() ?? "";
      const requiresComment = input.decision === "approved"
        ? parsed.data.requireCommentOnApprove
        : input.decision === "rejected"
          ? parsed.data.requireCommentOnReject
          : parsed.data.requireCommentOnReturn;
      if (requiresComment && comment.length === 0) {
        throw new WorkflowRuntimeEngineError("comment_required", "Dit goedkeuringsbesluit vereist een opmerking.");
      }
      const currentVote: WorkflowApprovalVote = {
        taskId: task.id,
        nodeKey: node.nodeKey,
        workflowRole: task.workflowRole,
        decidedByUserId: input.actor.id,
        decision: input.decision,
        occurredAt: input.occurredAt,
      };
      const approvalPolicy = parsed.data.approvalGroupId
        ? approvalPolicyFromGraph(graph, parsed.data.approvalGroupId)
        : null;
      const policyEvaluation = approvalPolicy
        ? evaluateWorkflowApprovalPolicy(approvalPolicy, [
          ...(await tx.listEvents(instance.instanceId)).map(approvalVoteFromEvent).filter((vote): vote is WorkflowApprovalVote => Boolean(vote)),
          currentVote,
        ])
        : null;
      if (policyEvaluation?.status === "invalid") {
        throw new WorkflowRuntimeEngineError("approval_policy_violation", `Meervoudige goedkeuringspolicy is ongeldig: ${policyEvaluation.blockingReasons.join(", ")}.`);
      }
      const output = {
        decision: input.decision,
        label: parsed.data.decisionLabels[input.decision],
        ...(comment ? { comment } : {}),
      };
      const updatedTask = await tx.updateTask({
        taskId: task.id,
        status: "completed",
        claimedByUserId: task.claimedByUserId,
        outcome: input.decision,
        formData: output,
        ...(comment ? { completionComment: comment } : {}),
        claimedAt: task.claimedAt,
        completedAt: input.occurredAt,
      });
      const result = await this.executeLocked(tx, instance, node, {
        type: "succeed_node",
        commandId: input.commandId,
        instanceId: instance.instanceId,
        nodeInstanceId: node.nodeInstanceId,
        expectedStatus: "running",
        actor: input.actor,
        correlationId: input.correlationId,
        occurredAt: input.occurredAt,
        output,
        selectedOutputPort: input.decision,
        outputVariables: [{
          name: decisionVariableName(node.nodeKey),
          dataType: "string",
          value: input.decision,
          classification: "confidential",
        }],
      });
      const approvalEvent = await tx.appendEvent({
        instanceId: instance.instanceId,
        nodeInstanceId: node.nodeInstanceId,
        eventType: "workflow.approval.decided",
        eventVersion: 1,
        payload: {
          taskId: updatedTask.id,
          nodeKey: node.nodeKey,
          workflowRole: task.workflowRole,
          decision: input.decision,
          decidedByUserId: input.actor.id,
          commentRequired: requiresComment,
        },
        actor: input.actor,
        idempotencyKey: `${input.commandId}:approval-event`,
        correlationId: input.correlationId,
        causationId: input.commandId,
        occurredAt: input.occurredAt,
      });
      const policyEvent = policyEvaluation
        ? await tx.appendEvent({
          instanceId: instance.instanceId,
          nodeInstanceId: node.nodeInstanceId,
          eventType: "workflow.approval.policy_evaluated",
          eventVersion: 1,
          payload: {
            ...policyEvaluation.auditPayload,
            triggeringTaskId: updatedTask.id,
            triggeringNodeKey: node.nodeKey,
          },
          actor: input.actor,
          idempotencyKey: `${input.commandId}:approval-policy-event`,
          correlationId: input.correlationId,
          causationId: input.commandId,
          occurredAt: input.occurredAt,
        })
        : null;
      return {
        ...result,
        events: policyEvent ? [...result.events, approvalEvent, policyEvent] : [...result.events, approvalEvent],
        variables: await tx.listVariables(instance.instanceId),
      };
    });
  }

  private async executeInTransaction(tx: WorkflowRuntimeTransaction, command: WorkflowRuntimeCommand): Promise<WorkflowEngineResult> {
    const instance = await tx.lockInstance(command.instanceId);
    if (!instance) throw new WorkflowRuntimeEngineError("instance_not_found", "Workflowinstance bestaat niet.");
    const duplicate = await tx.findCommandEvent(command.instanceId, command.commandId);
    if (duplicate) return this.duplicateResult(tx, instance, command.commandId);
    if (!("nodeInstanceId" in command)) return this.executeLocked(tx, instance, null, command);
    const node = await tx.loadNode(command.nodeInstanceId);
    if (!node || node.instanceId !== command.instanceId) throw new WorkflowRuntimeEngineError("node_not_found", "Node-attempt bestaat niet binnen deze instance.");
    return this.executeLocked(tx, instance, node, command);
  }

  private async executeLocked(
    tx: WorkflowRuntimeTransaction,
    lockedInstance: WorkflowRuntimeInstanceRecord,
    node: WorkflowRuntimeNodeRecord | null,
    command: WorkflowRuntimeCommand,
  ): Promise<WorkflowEngineResult> {
    if (node && ["completed", "cancelled", "failed"].includes(lockedInstance.status)) {
      throw new WorkflowRuntimeEngineError("instance_not_runnable", `Instance met status ${lockedInstance.status} accepteert geen node-commands.`);
    }
    const current = node ?? lockedInstance;
    const transition = handleWorkflowRuntimeCommand(current, command);
    const events: WorkflowEngineEvent[] = [];
    let instance = lockedInstance;
    let state: WorkflowRuntimeState;

    if (transition.state.kind === "instance") {
      instance = mergeInstanceState(lockedInstance, transition.state);
      state = instance;
      await tx.updateInstance(instance);
    } else if (!node) {
      throw new WorkflowRuntimeEngineError("node_not_found", "Node-command mist een bestaand node-attempt.");
    } else if (transition.persistence === "insert_node_attempt") {
      const inserted = await tx.insertNodeAttempt({
        ...nodeAttemptInput({
          instance,
          definition: {
            id: node.workflowNodeId,
            workflowVersionId: node.workflowVersionId,
            nodeKey: node.nodeKey,
            blockType: node.blockType,
            configuration: {},
          },
          nodeInstanceId: transition.state.nodeInstanceId,
          idempotencyKey: command.commandId,
          causationId: command.causationId ?? command.commandId,
          occurredAt: transition.state.availableAt,
          maxAttempts: node.maxAttempts,
        }),
      });
      state = inserted.node;
    } else {
      const updated = mergeNodeState(node, transition.state);
      await tx.updateNode(updated);
      state = updated;
    }

    events.push(await tx.appendEvent(transitionEvent(
      transition.event,
      node?.nodeInstanceId,
    )));
    if (node && command.type === "succeed_node" && command.outputVariables?.length) {
      const assignments = validateWorkflowVariableAssignments(command.outputVariables, node.nodeInstanceId);
      for (const assignment of assignments) {
        await tx.writeVariable({
          id: randomUUID(),
          instanceId: instance.instanceId,
          sourceNodeInstanceId: node.nodeInstanceId,
          assignment,
          idempotencyKey: `${command.commandId}:variable:${assignment.name}`,
          correlationId: command.correlationId,
        });
      }
    }
    const activatedNodes = node && command.type === "succeed_node"
      ? await this.activateSuccessors(tx, instance, node, command, events)
      : [];

    if (node?.blockType === "end" && command.type === "succeed_node" && instance.status === "running") {
      const completion = handleWorkflowRuntimeCommand(instance, {
        type: "complete_instance",
        commandId: `${command.commandId}:complete-instance`,
        instanceId: instance.instanceId,
        expectedStatus: "running",
        actor: command.actor,
        correlationId: command.correlationId,
        causationId: command.commandId,
        occurredAt: command.occurredAt,
        result: { terminalNodeKey: node.nodeKey },
      });
      instance = mergeInstanceState(instance, completion.state as WorkflowInstanceState);
      await tx.updateInstance(instance);
      events.push(await tx.appendEvent(transitionEvent(completion.event)));
    }

    return { instance, state, activatedNodes, events, variables: await tx.listVariables(instance.instanceId), deduplicated: false };
  }

  private async activateSuccessors(
    tx: WorkflowRuntimeTransaction,
    instance: WorkflowRuntimeInstanceRecord,
    source: WorkflowRuntimeNodeRecord,
    command: Extract<WorkflowRuntimeCommand, { type: "succeed_node" }>,
    events: WorkflowEngineEvent[],
  ): Promise<WorkflowRuntimeNodeRecord[]> {
    const selectedOutputPort = command.selectedOutputPort ?? "out";
    const edges = await tx.listOutgoingEdges(instance.workflowVersionId, source.workflowNodeId, selectedOutputPort);
    const variables = edges.some((edge) => edge.condition !== null)
      ? await tx.listVariables(instance.instanceId)
      : [];
    const selectedEdges = edges.filter((edge) => {
      if (edge.condition === null) return true;
      const evaluation = evaluateWorkflowRuntimeExpression(edge.condition, variables, {
        nodeInstanceId: source.nodeInstanceId,
        edgeId: edge.id,
      });
      if (!evaluation.valid) throw new WorkflowVariableRuntimeError(evaluation.issues);
      return evaluation.matched;
    });
    const graph = await tx.loadPublishedGraph(instance.workflowVersionId);
    if (!graph) throw new WorkflowRuntimeEngineError("version_not_published", "De gepinde workflowversie is niet meer beschikbaar.");
    const byId = new Map(graph.nodes.map((definition) => [definition.id, definition]));
    const activated: WorkflowRuntimeNodeRecord[] = [];
    for (const edge of selectedEdges) {
      const target = byId.get(edge.targetNodeId);
      if (!target) throw new WorkflowRuntimeEngineError("invalid_graph", `Edge ${edge.edgeKey} verwijst naar een ontbrekende targetnode.`);
      const idempotencyKey = target.blockType === "parallel_join"
        ? `parallel-join:${instance.instanceId}:${target.id}`
        : `${command.commandId}:edge:${edge.id}`;
      const inserted = await tx.insertNodeAttempt(nodeAttemptInput({
        instance,
        definition: target,
        nodeInstanceId: randomUUID(),
        idempotencyKey,
        causationId: command.commandId,
        occurredAt: command.occurredAt,
      }));
      let activatedNode = inserted.node;
      if (target.blockType === "parallel_join") {
        const evaluation = await this.evaluateJoin(tx, instance, target);
        const nextStatus = evaluation.satisfied ? "ready" as const : "waiting" as const;
        const nextNode = {
          ...activatedNode,
          status: nextStatus,
          startedAt: nextStatus === "waiting" ? command.occurredAt : undefined,
          availableAt: command.occurredAt,
        };
        await tx.updateNode(nextNode);
        activatedNode = nextNode;
        events.push(await tx.appendEvent(joinStatusEvent({
          instance,
          node: activatedNode,
          actor: command.actor,
          idempotencyKey: `${idempotencyKey}:join:${command.commandId}`,
          causationId: command.commandId,
          occurredAt: command.occurredAt,
          ...evaluation,
        })));
      }
      activated.push(activatedNode);
      if (inserted.created) events.push(await tx.appendEvent(activationEvent({
        instance,
        node: activatedNode,
        actor: command.actor,
        idempotencyKey: `${idempotencyKey}:event`,
        causationId: command.commandId,
        occurredAt: command.occurredAt,
        sourceEdgeId: edge.id,
      })));
    }
    return activated;
  }

  private async evaluateJoin(
    tx: WorkflowRuntimeTransaction,
    instance: WorkflowRuntimeInstanceRecord,
    definition: WorkflowRuntimeNodeDefinition,
  ): Promise<{ satisfied: boolean; succeededBranches: number; terminalBranches: number; requiredBranches: number }> {
    const parsed = workflowParallelJoinConfigurationSchema.safeParse(definition.configuration);
    if (!parsed.success) throw new WorkflowRuntimeEngineError("invalid_graph", `Parallel-joinconfiguratie is ongeldig: ${parsed.error.issues.map((issue) => issue.message).join(" ")}`);
    const incoming = await tx.listIncomingEdges(instance.workflowVersionId, definition.id, "in");
    const nodes = await tx.listNodes(instance.instanceId);
    const predecessorIds = new Set(incoming.map((edge) => edge.sourceNodeId));
    const predecessorAttempts = nodes.filter((node) => predecessorIds.has(node.workflowNodeId));
    const succeededBranches = new Set(predecessorAttempts.filter((node) => node.status === "succeeded").map((node) => node.workflowNodeId)).size;
    const terminalBranches = new Set(predecessorAttempts.filter((node) => ["succeeded", "skipped", "failed"].includes(node.status)).map((node) => node.workflowNodeId)).size;
    const requiredBranches = incoming.length;
    const satisfied = parsed.data.mode === "or"
      ? succeededBranches >= 1
      : parsed.data.mode === "quorum"
        ? succeededBranches >= (parsed.data.quorum ?? requiredBranches + 1)
        : succeededBranches >= requiredBranches;
    return { satisfied, succeededBranches, terminalBranches, requiredBranches };
  }

  private async duplicateResult(
    tx: WorkflowRuntimeTransaction,
    instance: WorkflowRuntimeInstanceRecord,
    idempotencyKey: string,
  ): Promise<WorkflowEngineResult> {
    const event = await tx.findCommandEvent(instance.instanceId, idempotencyKey);
    const nodes = await tx.listNodes(instance.instanceId);
    const eventNode = event?.nodeInstanceId ? nodes.find((node) => node.nodeInstanceId === event.nodeInstanceId) : undefined;
    return {
      instance,
      state: eventNode ?? instance,
      activatedNodes: [],
      events: event ? [event] : [],
      variables: await tx.listVariables(instance.instanceId),
      deduplicated: true,
    };
  }
}


function snapshotFromReadRecord(record: ClientConfigReadRecord, readAt: string): WorkflowDataSnapshot {
  return Object.freeze({
    snapshotVersion: 1,
    resourceId: record.resourceId,
    sourceRecordId: record.sourceRecordId,
    selectedFields: Object.freeze({ ...record.fields }),
    concurrencyToken: record.concurrencyToken,
    readAt,
  });
}

function lookupVariableValue(snapshot: WorkflowRuntimeSnapshotRecord): Record<string, JsonValue> {
  return {
    ...snapshot.selectedFields,
    _snapshot: {
      id: snapshot.id,
      resourceId: snapshot.resourceId,
      sourceRecordId: snapshot.sourceRecordId,
      concurrencyToken: snapshot.concurrencyToken,
      snapshotVersion: snapshot.snapshotVersion,
      readAt: snapshot.readAt,
    },
  };
}

function lookupJsonValue(
  variables: Readonly<Record<string, unknown>>,
  variableId: string,
  attributeId?: string,
): JsonValue {
  const source = variables[variableId];
  const value = attributeId && source && typeof source === "object" && !Array.isArray(source)
    ? (source as Record<string, unknown>)[attributeId]
    : source;
  if (
    value === null
    || typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
  ) {
    return value;
  }
  throw new WorkflowRuntimeEngineError("lookup_failed", `Lookupfilter ${variableId} levert geen JSON-primitieve waarde op.`);
}

function lookupClientScope(
  variables: Readonly<Record<string, unknown>>,
  variableId: string,
  instanceClientIds: readonly string[] | null,
): readonly string[] {
  const source = variables[variableId];
  const values = Array.isArray(source) ? source : [source];
  const clientIds = [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))].sort();
  if (clientIds.length === 0) {
    throw new WorkflowRuntimeEngineError("lookup_failed", `Client-scopebinding ${variableId} levert geen client-ID op.`);
  }
  if (instanceClientIds && clientIds.some((clientId) => !instanceClientIds.includes(clientId))) {
    throw new WorkflowRuntimeEngineError("scope_mismatch", "De lookup-clientbinding valt buiten de instance-clientscope.");
  }
  return clientIds;
}

export function createWorkflowRuntimeEngine(store: WorkflowRuntimeStore): WorkflowRuntimeEngine {
  return new WorkflowRuntimeEngine(store);
}
