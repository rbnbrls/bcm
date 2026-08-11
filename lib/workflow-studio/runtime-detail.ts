import type { Sql } from "postgres";

import type { SqlExecutor } from "@/lib/workflow-studio/definition-repository";
import type {
  WorkflowEngineEvent,
  WorkflowRuntimeChangeIntentRecord,
  WorkflowRuntimeInstanceRecord,
  WorkflowRuntimeNodeRecord,
  WorkflowRuntimeSnapshotRecord,
  WorkflowTaskRecord,
} from "@/lib/workflow-studio/runtime-engine";
import type { JsonValue } from "@/lib/workflow-studio/read-adapters";
import type { WorkflowOutboxMessage } from "@/lib/workflow-studio/runtime-outbox";

export type WorkflowRuntimeDecisionSummary = Readonly<{
  eventId?: string;
  nodeInstanceId?: string;
  eventType: string;
  occurredAt: string;
  payload: Readonly<Record<string, unknown>>;
}>;

export type WorkflowRuntimeDetailModel = Readonly<{
  instance: WorkflowRuntimeInstanceRecord;
  activeNodes: readonly WorkflowRuntimeNodeRecord[];
  nodes: readonly WorkflowRuntimeNodeRecord[];
  tasks: readonly WorkflowTaskRecord[];
  snapshots: readonly WorkflowRuntimeSnapshotRecord[];
  changeIntents: readonly WorkflowRuntimeChangeIntentRecord[];
  decisions: readonly WorkflowRuntimeDecisionSummary[];
  events: readonly WorkflowEngineEvent[];
  outbox: readonly WorkflowOutboxMessage[];
  retryableNodes: readonly WorkflowRuntimeNodeRecord[];
}>;

export interface WorkflowRuntimeDetailReader {
  loadInstance(instanceId: string): Promise<WorkflowRuntimeInstanceRecord | null>;
  listNodes(instanceId: string): Promise<readonly WorkflowRuntimeNodeRecord[]>;
  listTasks(instanceId: string): Promise<readonly WorkflowTaskRecord[]>;
  listSnapshots(instanceId: string): Promise<readonly WorkflowRuntimeSnapshotRecord[]>;
  listChangeIntents(instanceId: string): Promise<readonly WorkflowRuntimeChangeIntentRecord[]>;
  listEvents(instanceId: string): Promise<readonly WorkflowEngineEvent[]>;
  listOutbox(instanceId: string): Promise<readonly WorkflowOutboxMessage[]>;
}

export class WorkflowRuntimeDetailService {
  constructor(private readonly reader: WorkflowRuntimeDetailReader) {}

  async load(instanceId: string): Promise<WorkflowRuntimeDetailModel | null> {
    const instance = await this.reader.loadInstance(instanceId);
    if (!instance) return null;
    const [nodes, tasks, snapshots, changeIntents, events, outbox] = await Promise.all([
      this.reader.listNodes(instanceId),
      this.reader.listTasks(instanceId),
      this.reader.listSnapshots(instanceId),
      this.reader.listChangeIntents(instanceId),
      this.reader.listEvents(instanceId),
      this.reader.listOutbox(instanceId),
    ]);
    const activeNodes = nodes.filter((node) => ["ready", "running", "waiting", "needs_intervention"].includes(node.status));
    const retryableNodes = nodes.filter((node) => (
      ["failed", "needs_intervention"].includes(node.status) && node.attempt < node.maxAttempts
    ));
    const decisions = events
      .filter((event) => event.eventType === "workflow.decision.evaluated" || event.eventType === "workflow.approval.decided")
      .map((event) => ({
        ...(event.id ? { eventId: event.id } : {}),
        ...(event.nodeInstanceId ? { nodeInstanceId: event.nodeInstanceId } : {}),
        eventType: event.eventType,
        occurredAt: event.occurredAt,
        payload: event.payload,
      }));
    return {
      instance,
      activeNodes,
      nodes,
      tasks,
      snapshots,
      changeIntents,
      decisions,
      events,
      outbox,
      retryableNodes,
    };
  }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function optionalString(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

function mapInstance(row: Record<string, unknown>): WorkflowRuntimeInstanceRecord {
  return {
    kind: "instance",
    instanceId: String(row.id),
    workflowVersionId: String(row.workflow_version_id),
    tenant: String(row.tenant),
    businessUnit: String(row.business_unit),
    clientIds: row.client_ids ? [...row.client_ids as string[]] : null,
    status: String(row.status) as WorkflowRuntimeInstanceRecord["status"],
    idempotencyKey: String(row.idempotency_key),
    correlationId: String(row.correlation_id),
    startedByUserId: String(row.started_by_user_id),
    input: object(row.input),
    ...(row.result ? { result: object(row.result) } : {}),
    ...(optionalString(row.deadline_at) ? { deadlineAt: optionalString(row.deadline_at)! } : {}),
    ...(optionalString(row.started_at) ? { startedAt: optionalString(row.started_at)! } : {}),
    ...(optionalString(row.completed_at) ? { completedAt: optionalString(row.completed_at)! } : {}),
    ...(optionalString(row.error_code) ? { errorCode: optionalString(row.error_code)! } : {}),
    ...(optionalString(row.error_message) ? { errorMessage: optionalString(row.error_message)! } : {}),
  };
}

function mapNode(row: Record<string, unknown>): WorkflowRuntimeNodeRecord {
  const blockType = String(row.block_type);
  return {
    kind: "node",
    instanceId: String(row.workflow_instance_id),
    nodeInstanceId: String(row.id),
    workflowVersionId: String(row.workflow_version_id),
    workflowNodeId: String(row.workflow_node_id),
    nodeKey: String(row.node_key),
    blockType,
    executionKind: ["form", "role_task", "approval"].includes(blockType) ? "human" : "automated",
    status: String(row.status) as WorkflowRuntimeNodeRecord["status"],
    attempt: Number(row.attempt),
    maxAttempts: Number(row.max_attempts),
    input: object(row.input),
    idempotencyKey: String(row.idempotency_key),
    correlationId: String(row.correlation_id),
    availableAt: String(row.available_at),
    ...(row.output ? { output: object(row.output) } : {}),
    ...(optionalString(row.causation_id) ? { causationId: optionalString(row.causation_id)! } : {}),
    ...(optionalString(row.deadline_at) ? { deadlineAt: optionalString(row.deadline_at)! } : {}),
    ...(optionalString(row.started_at) ? { startedAt: optionalString(row.started_at)! } : {}),
    ...(optionalString(row.completed_at) ? { completedAt: optionalString(row.completed_at)! } : {}),
    ...(optionalString(row.error_class) ? { errorClass: optionalString(row.error_class)! as WorkflowRuntimeNodeRecord["errorClass"] } : {}),
    ...(optionalString(row.error_code) ? { errorCode: optionalString(row.error_code)! } : {}),
    ...(optionalString(row.error_message) ? { errorMessage: optionalString(row.error_message)! } : {}),
    ...(optionalString(row.lease_owner) ? { leaseOwner: optionalString(row.lease_owner)! } : {}),
    ...(optionalString(row.lease_expires_at) ? { leaseExpiresAt: optionalString(row.lease_expires_at)! } : {}),
  };
}

function mapTask(row: Record<string, unknown>): WorkflowTaskRecord {
  return {
    id: String(row.id),
    instanceId: String(row.workflow_instance_id),
    workflowVersionId: String(row.workflow_version_id),
    nodeInstanceId: String(row.workflow_node_instance_id),
    roleBindingId: String(row.workflow_role_binding_id),
    status: String(row.status) as WorkflowTaskRecord["status"],
    title: String(row.title),
    instructions: String(row.instructions),
    assigneeGroup: String(row.assignee_group),
    ...(optionalString(row.claimed_by_user_id) ? { claimedByUserId: optionalString(row.claimed_by_user_id)! } : {}),
    ...(optionalString(row.outcome) ? { outcome: optionalString(row.outcome)! } : {}),
    ...(row.form_data ? { formData: object(row.form_data) } : {}),
    ...(optionalString(row.completion_comment) ? { completionComment: optionalString(row.completion_comment)! } : {}),
    idempotencyKey: String(row.idempotency_key),
    correlationId: String(row.correlation_id),
    ...(optionalString(row.causation_id) ? { causationId: optionalString(row.causation_id)! } : {}),
    ...(optionalString(row.deadline_at) ? { deadlineAt: optionalString(row.deadline_at)! } : {}),
    ...(optionalString(row.claimed_at) ? { claimedAt: optionalString(row.claimed_at)! } : {}),
    ...(optionalString(row.completed_at) ? { completedAt: optionalString(row.completed_at)! } : {}),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    workflowRole: String(row.workflow_role),
    permissions: [...row.permissions as string[]],
    tenant: String(row.tenant),
    businessUnit: String(row.business_unit),
    clientIds: row.client_ids ? [...row.client_ids as string[]] : null,
  };
}

function mapEvent(row: Record<string, unknown>): WorkflowEngineEvent {
  return {
    id: String(row.id),
    sequenceNumber: Number(row.sequence_number),
    instanceId: String(row.workflow_instance_id),
    ...(optionalString(row.workflow_node_instance_id) ? { nodeInstanceId: optionalString(row.workflow_node_instance_id)! } : {}),
    eventType: String(row.event_type),
    eventVersion: Number(row.event_version),
    payload: object(row.payload),
    actor: { type: String(row.actor_type) as "user" | "system", id: String(row.actor_id), ...(optionalString(row.actor_session_id) ? { sessionId: optionalString(row.actor_session_id)! } : {}) },
    idempotencyKey: String(row.idempotency_key),
    correlationId: String(row.correlation_id),
    ...(optionalString(row.causation_id) ? { causationId: optionalString(row.causation_id)! } : {}),
    occurredAt: String(row.occurred_at),
  };
}

function mapSnapshot(row: Record<string, unknown>): WorkflowRuntimeSnapshotRecord {
  return {
    id: String(row.id),
    instanceId: String(row.workflow_instance_id),
    sourceNodeInstanceId: String(row.workflow_node_instance_id),
    resourceId: String(row.resource_id),
    sourceRecordId: String(row.source_record_id),
    selectedFields: object(row.selected_fields) as Record<string, JsonValue>,
    concurrencyToken: String(row.concurrency_token),
    snapshotVersion: Number(row.snapshot_version),
    idempotencyKey: String(row.idempotency_key),
    correlationId: String(row.correlation_id),
    ...(optionalString(row.causation_id) ? { causationId: optionalString(row.causation_id)! } : {}),
    readAt: String(row.read_at),
  };
}

function mapIntent(row: Record<string, unknown>): WorkflowRuntimeChangeIntentRecord {
  return {
    id: String(row.id),
    instanceId: String(row.workflow_instance_id),
    nodeInstanceId: String(row.workflow_node_instance_id),
    ...(optionalString(row.workflow_data_snapshot_id) ? { snapshotId: optionalString(row.workflow_data_snapshot_id)! } : {}),
    adapterId: String(row.adapter_id),
    resourceId: String(row.resource_id),
    operation: String(row.operation) as WorkflowRuntimeChangeIntentRecord["operation"],
    status: String(row.status) as WorkflowRuntimeChangeIntentRecord["status"],
    payload: object(row.payload),
    preconditions: object(row.preconditions),
    ...(row.dry_run_result ? { dryRunResult: object(row.dry_run_result) as WorkflowRuntimeChangeIntentRecord["dryRunResult"] } : {}),
    ...(row.apply_result ? { applyResult: object(row.apply_result) as WorkflowRuntimeChangeIntentRecord["applyResult"] } : {}),
    idempotencyKey: String(row.idempotency_key),
    correlationId: String(row.correlation_id),
    ...(optionalString(row.causation_id) ? { causationId: optionalString(row.causation_id)! } : {}),
    ...(optionalString(row.effective_at) ? { effectiveAt: optionalString(row.effective_at)! } : {}),
    ...(optionalString(row.approved_by_user_id) ? { approvedByUserId: optionalString(row.approved_by_user_id)! } : {}),
    ...(optionalString(row.approved_at) ? { approvedAt: optionalString(row.approved_at)! } : {}),
    ...(optionalString(row.applied_at) ? { appliedAt: optionalString(row.applied_at)! } : {}),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapOutbox(row: Record<string, unknown>): WorkflowOutboxMessage {
  return {
    id: String(row.id),
    workflowInstanceId: String(row.workflow_instance_id),
    ...(optionalString(row.workflow_node_instance_id) ? { workflowNodeInstanceId: optionalString(row.workflow_node_instance_id)! } : {}),
    ...(optionalString(row.workflow_event_id) ? { workflowEventId: optionalString(row.workflow_event_id)! } : {}),
    kind: String(row.kind) as WorkflowOutboxMessage["kind"],
    target: String(row.target),
    status: String(row.status) as WorkflowOutboxMessage["status"],
    payload: object(row.payload),
    idempotencyKey: String(row.idempotency_key),
    correlationId: String(row.correlation_id),
    ...(optionalString(row.causation_id) ? { causationId: optionalString(row.causation_id)! } : {}),
    attempt: Number(row.attempt),
    maxAttempts: Number(row.max_attempts),
    availableAt: String(row.available_at),
    ...(optionalString(row.lease_owner) ? { leaseOwner: optionalString(row.lease_owner)! } : {}),
    ...(optionalString(row.lease_expires_at) ? { leaseExpiresAt: optionalString(row.lease_expires_at)! } : {}),
    ...(optionalString(row.delivered_at) ? { deliveredAt: optionalString(row.delivered_at)! } : {}),
    ...(optionalString(row.dead_letter_at) ? { deadLetterAt: optionalString(row.dead_letter_at)! } : {}),
    ...(optionalString(row.last_error) ? { lastError: optionalString(row.last_error)! } : {}),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export class PostgresWorkflowRuntimeDetailReader implements WorkflowRuntimeDetailReader {
  constructor(private readonly sql: SqlExecutor) {}

  async loadInstance(instanceId: string): Promise<WorkflowRuntimeInstanceRecord | null> {
    const [row] = await this.sql<Record<string, unknown>[]>`SELECT * FROM workflow_instance WHERE id = ${instanceId} LIMIT 1`;
    return row ? mapInstance(row) : null;
  }

  async listNodes(instanceId: string): Promise<readonly WorkflowRuntimeNodeRecord[]> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT ni.*, wn.node_key, wn.block_type
      FROM workflow_node_instance ni JOIN workflow_node wn ON wn.id = ni.workflow_node_id
      WHERE ni.workflow_instance_id = ${instanceId}
      ORDER BY ni.created_at, ni.attempt, ni.id
    `;
    return rows.map(mapNode);
  }

  async listTasks(instanceId: string): Promise<readonly WorkflowTaskRecord[]> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT wt.*, wrb.workflow_role, wrb.permissions, wrb.tenant, wrb.business_unit, wrb.client_ids
      FROM workflow_task wt JOIN workflow_role_binding wrb ON wrb.id = wt.workflow_role_binding_id
      WHERE wt.workflow_instance_id = ${instanceId}
      ORDER BY wt.created_at, wt.id
    `;
    return rows.map(mapTask);
  }

  async listSnapshots(instanceId: string): Promise<readonly WorkflowRuntimeSnapshotRecord[]> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT * FROM workflow_data_snapshot
      WHERE workflow_instance_id = ${instanceId}
      ORDER BY read_at, id
    `;
    return rows.map(mapSnapshot);
  }

  async listChangeIntents(instanceId: string): Promise<readonly WorkflowRuntimeChangeIntentRecord[]> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT * FROM workflow_change_intent
      WHERE workflow_instance_id = ${instanceId}
      ORDER BY created_at, id
    `;
    return rows.map(mapIntent);
  }

  async listEvents(instanceId: string): Promise<readonly WorkflowEngineEvent[]> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT * FROM workflow_event
      WHERE workflow_instance_id = ${instanceId}
      ORDER BY sequence_number, created_at, id
    `;
    return rows.map(mapEvent);
  }

  async listOutbox(instanceId: string): Promise<readonly WorkflowOutboxMessage[]> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT * FROM workflow_outbox
      WHERE workflow_instance_id = ${instanceId}
      ORDER BY created_at, id
    `;
    return rows.map(mapOutbox);
  }
}
