import { randomUUID } from "node:crypto";

import type { Sql } from "postgres";

import type { SqlExecutor } from "@/lib/workflow-studio/definition-repository";
import type {
  InsertNodeAttemptResult,
  InsertWorkflowInstance,
  InsertWorkflowNodeAttempt,
  WorkflowEngineEvent,
  WorkflowRuntimeEdgeDefinition,
  WorkflowRuntimeGraph,
  WorkflowRuntimeInstanceRecord,
  WorkflowRuntimeNodeRecord,
  WorkflowRuntimeSnapshotRecord,
  WorkflowRuntimeSnapshotWrite,
  WorkflowRuntimeSnapshotWriteResult,
  InsertWorkflowTask,
  WorkflowRuntimeChangeIntentRecord,
  WorkflowRuntimeChangeIntentStatus,
  WorkflowRuntimeChangeIntentApplyUpdate,
  WorkflowRuntimeChangeIntentWrite,
  WorkflowRuntimeChangeIntentWriteResult,
  WorkflowRuntimeOutboxWriteResult,
  WorkflowRuntimeRoleBindingRecord,
  WorkflowRuntimeStore,
  WorkflowTaskMutation,
  WorkflowTaskRecord,
  WorkflowTaskStatus,
  WorkflowTaskWriteResult,
  WorkflowRuntimeTransaction,
} from "@/lib/workflow-studio/runtime-engine";
import type { WorkflowOutboxEnqueueInput, WorkflowOutboxMessage, WorkflowOutboxStatus } from "@/lib/workflow-studio/runtime-outbox";
import type { JsonValue as WorkflowRuntimeJsonValue } from "@/lib/workflow-studio/read-adapters";
import type { WorkflowFailureClass, WorkflowInstanceStatus, WorkflowNodeStatus } from "@/lib/workflow-studio/runtime-state-machine";
import {
  WorkflowVariableRuntimeError,
  type WorkflowVariableDataType,
  type WorkflowVariableClassification,
  type WorkflowVariableRecord,
  type WorkflowVariableWrite,
  type WorkflowVariableWriteResult,
} from "@/lib/workflow-studio/runtime-variables";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function jsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function optionalString(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

const INSTANCE_COLUMNS = `
  id, workflow_version_id, tenant, business_unit, client_ids, status,
  idempotency_key, correlation_id, started_by_user_id, input, result,
  deadline_at, started_at, completed_at, error_code, error_message
`;

const NODE_COLUMNS = `
  ni.id, ni.workflow_instance_id, ni.workflow_version_id, ni.workflow_node_id,
  ni.status, ni.attempt, ni.max_attempts, ni.idempotency_key,
  ni.correlation_id, ni.causation_id, ni.input, ni.output, ni.error_class,
  ni.error_code, ni.error_message, ni.available_at, ni.deadline_at,
  ni.started_at, ni.completed_at, ni.lease_owner, ni.lease_expires_at,
  wn.node_key, wn.block_type
`;

const TASK_COLUMNS = `
  wt.id, wt.workflow_instance_id, wt.workflow_version_id, wt.workflow_node_instance_id,
  wt.workflow_role_binding_id, wt.status, wt.title, wt.instructions,
  wt.assignee_group, wt.claimed_by_user_id, wt.outcome, wt.form_data,
  wt.completion_comment, wt.idempotency_key, wt.correlation_id, wt.causation_id,
  wt.deadline_at, wt.claimed_at, wt.completed_at, wt.created_at, wt.updated_at,
  wrb.workflow_role, wrb.permissions, wrb.tenant, wrb.business_unit, wrb.client_ids
`;

const CHANGE_INTENT_COLUMNS = `
  id, workflow_instance_id, workflow_node_instance_id, workflow_data_snapshot_id,
  adapter_id, resource_id, operation, status, payload, preconditions,
  dry_run_result, apply_result, idempotency_key, correlation_id, causation_id,
  effective_at, approved_by_user_id, approved_at, applied_at, created_at, updated_at
`;

function mapInstance(row: Record<string, unknown>): WorkflowRuntimeInstanceRecord {
  return {
    kind: "instance",
    instanceId: String(row.id),
    workflowVersionId: String(row.workflow_version_id),
    tenant: String(row.tenant),
    businessUnit: String(row.business_unit),
    clientIds: row.client_ids ? [...row.client_ids as string[]] : null,
    status: String(row.status) as WorkflowInstanceStatus,
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

function nodeExecutionKind(blockType: string): WorkflowRuntimeNodeRecord["executionKind"] {
  return ["form", "role_task", "approval"].includes(blockType) ? "human" : "automated";
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
    executionKind: nodeExecutionKind(blockType),
    status: String(row.status) as WorkflowNodeStatus,
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
    ...(optionalString(row.error_class) ? { errorClass: optionalString(row.error_class)! as WorkflowFailureClass } : {}),
    ...(optionalString(row.error_code) ? { errorCode: optionalString(row.error_code)! } : {}),
    ...(optionalString(row.error_message) ? { errorMessage: optionalString(row.error_message)! } : {}),
    ...(optionalString(row.lease_owner) ? { leaseOwner: optionalString(row.lease_owner)! } : {}),
    ...(optionalString(row.lease_expires_at) ? { leaseExpiresAt: optionalString(row.lease_expires_at)! } : {}),
  };
}

function mapEdge(row: Record<string, unknown>): WorkflowRuntimeEdgeDefinition {
  return {
    id: String(row.id),
    workflowVersionId: String(row.workflow_version_id),
    edgeKey: String(row.edge_key),
    sourceNodeId: String(row.source_node_id),
    sourcePort: String(row.source_port),
    targetNodeId: String(row.target_node_id),
    targetPort: String(row.target_port),
    condition: row.condition ?? null,
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
    actor: {
      type: String(row.actor_type) as "user" | "system",
      id: String(row.actor_id),
      ...(optionalString(row.actor_session_id) ? { sessionId: optionalString(row.actor_session_id)! } : {}),
    },
    idempotencyKey: String(row.idempotency_key),
    correlationId: String(row.correlation_id),
    ...(optionalString(row.causation_id) ? { causationId: optionalString(row.causation_id)! } : {}),
    occurredAt: String(row.occurred_at),
  };
}

function mapVariable(row: Record<string, unknown>): WorkflowVariableRecord {
  const sourceNodeInstanceId = optionalString(row.source_node_instance_id);
  return {
    id: String(row.id),
    instanceId: String(row.workflow_instance_id),
    ...(sourceNodeInstanceId ? { sourceNodeInstanceId } : {}),
    scope: sourceNodeInstanceId ? "node_output" : "instance",
    name: String(row.name),
    dataType: String(row.data_type) as WorkflowVariableDataType,
    value: structuredClone(row.value),
    classification: String(row.classification) as WorkflowVariableClassification,
    revision: Number(row.revision),
    idempotencyKey: String(row.idempotency_key),
    correlationId: String(row.correlation_id),
  };
}

function mapSnapshot(row: Record<string, unknown>): WorkflowRuntimeSnapshotRecord {
  return {
    id: String(row.id),
    instanceId: String(row.workflow_instance_id),
    sourceNodeInstanceId: String(row.workflow_node_instance_id),
    resourceId: String(row.resource_id),
    sourceRecordId: String(row.source_record_id),
    selectedFields: object(row.selected_fields) as Record<string, WorkflowRuntimeJsonValue>,
    concurrencyToken: String(row.concurrency_token),
    snapshotVersion: Number(row.snapshot_version),
    idempotencyKey: String(row.idempotency_key),
    correlationId: String(row.correlation_id),
    ...(optionalString(row.causation_id) ? { causationId: optionalString(row.causation_id)! } : {}),
    readAt: String(row.read_at),
  };
}

function mapRoleBinding(row: Record<string, unknown>): WorkflowRuntimeRoleBindingRecord {
  return {
    id: String(row.id),
    workflowVersionId: String(row.workflow_version_id),
    workflowRole: String(row.workflow_role),
    identityGroup: String(row.identity_group),
    permissions: [...row.permissions as string[]],
    tenant: String(row.tenant),
    businessUnit: String(row.business_unit),
    clientIds: row.client_ids ? [...row.client_ids as string[]] : null,
  };
}

function mapTask(row: Record<string, unknown>): WorkflowTaskRecord {
  return {
    id: String(row.id),
    instanceId: String(row.workflow_instance_id),
    workflowVersionId: String(row.workflow_version_id),
    nodeInstanceId: String(row.workflow_node_instance_id),
    roleBindingId: String(row.workflow_role_binding_id),
    status: String(row.status) as WorkflowTaskStatus,
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

function mapChangeIntent(row: Record<string, unknown>): WorkflowRuntimeChangeIntentRecord {
  return {
    id: String(row.id),
    instanceId: String(row.workflow_instance_id),
    nodeInstanceId: String(row.workflow_node_instance_id),
    ...(optionalString(row.workflow_data_snapshot_id) ? { snapshotId: optionalString(row.workflow_data_snapshot_id)! } : {}),
    adapterId: String(row.adapter_id),
    resourceId: String(row.resource_id),
    operation: String(row.operation) as "CREATE" | "UPDATE" | "RETIRE",
    status: String(row.status) as WorkflowRuntimeChangeIntentStatus,
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
    status: String(row.status) as WorkflowOutboxStatus,
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

export class PostgresWorkflowRuntimeTransaction implements WorkflowRuntimeTransaction {
  constructor(private readonly sql: Sql) {}

  async findInstanceByStartKey(tenant: string, idempotencyKey: string): Promise<WorkflowRuntimeInstanceRecord | null> {
    const [row] = await this.sql<Record<string, unknown>[]>`
      SELECT ${this.sql.unsafe(INSTANCE_COLUMNS)} FROM workflow_instance
      WHERE tenant = ${tenant} AND idempotency_key = ${idempotencyKey}
      LIMIT 1
    `;
    return row ? mapInstance(row) : null;
  }

  async loadPublishedGraph(workflowVersionId: string): Promise<WorkflowRuntimeGraph | null> {
    const [scope] = await this.sql<Record<string, unknown>[]>`
      SELECT v.id AS workflow_version_id, d.status AS definition_status,
             d.tenant, d.business_unit, d.client_ids
      FROM workflow_version v
      JOIN workflow_definition d ON d.id = v.workflow_definition_id
      WHERE v.id = ${workflowVersionId} AND v.status = 'published'
      LIMIT 1
    `;
    if (!scope) return null;
    const nodes = await this.sql<Record<string, unknown>[]>`
      SELECT id, workflow_version_id, node_key, block_type, configuration
      FROM workflow_node WHERE workflow_version_id = ${workflowVersionId}
      ORDER BY node_key, id
    `;
    const edges = await this.sql<Record<string, unknown>[]>`
      SELECT id, workflow_version_id, edge_key, source_node_id, source_port,
             target_node_id, target_port, condition
      FROM workflow_edge WHERE workflow_version_id = ${workflowVersionId}
      ORDER BY edge_key, id
    `;
    return {
      workflowVersionId: String(scope.workflow_version_id),
      definitionStatus: String(scope.definition_status) as WorkflowRuntimeGraph["definitionStatus"],
      tenant: String(scope.tenant),
      businessUnit: String(scope.business_unit),
      clientIds: scope.client_ids ? [...scope.client_ids as string[]] : null,
      nodes: nodes.map((row) => ({
        id: String(row.id),
        workflowVersionId: String(row.workflow_version_id),
        nodeKey: String(row.node_key),
        blockType: String(row.block_type),
        configuration: object(row.configuration),
      })),
      edges: edges.map(mapEdge),
    };
  }

  async insertInstance(input: InsertWorkflowInstance): Promise<WorkflowRuntimeInstanceRecord | null> {
    const [row] = await this.sql<Record<string, unknown>[]>`
      INSERT INTO workflow_instance (
        id, workflow_version_id, tenant, business_unit, client_ids, status,
        idempotency_key, correlation_id, started_by_user_id, input, deadline_at
      ) VALUES (
        ${input.instanceId}, ${input.workflowVersionId}, ${input.tenant}, ${input.businessUnit},
        ${input.clientIds ? this.sql.array([...input.clientIds]) : null}, 'pending',
        ${input.idempotencyKey}, ${input.correlationId}, ${input.startedByUserId},
        ${this.sql.json(jsonValue(input.input))}, ${input.deadlineAt ?? null}
      )
      ON CONFLICT (tenant, idempotency_key) DO NOTHING
      RETURNING ${this.sql.unsafe(INSTANCE_COLUMNS)}
    `;
    return row ? mapInstance(row) : null;
  }

  async lockInstance(instanceId: string): Promise<WorkflowRuntimeInstanceRecord | null> {
    const [row] = await this.sql<Record<string, unknown>[]>`
      SELECT ${this.sql.unsafe(INSTANCE_COLUMNS)} FROM workflow_instance
      WHERE id = ${instanceId} FOR UPDATE
    `;
    return row ? mapInstance(row) : null;
  }

  async updateInstance(state: WorkflowRuntimeInstanceRecord): Promise<void> {
    await this.sql`
      UPDATE workflow_instance SET
        status = ${state.status}, result = ${state.result ? this.sql.json(jsonValue(state.result)) : null},
        started_at = ${state.startedAt ?? null}, completed_at = ${state.completedAt ?? null},
        error_code = ${state.errorCode ?? null}, error_message = ${state.errorMessage ?? null},
        updated_at = now()
      WHERE id = ${state.instanceId}
    `;
  }

  async loadNode(nodeInstanceId: string): Promise<WorkflowRuntimeNodeRecord | null> {
    const [row] = await this.sql<Record<string, unknown>[]>`
      SELECT ${this.sql.unsafe(NODE_COLUMNS)}
      FROM workflow_node_instance ni JOIN workflow_node wn ON wn.id = ni.workflow_node_id
      WHERE ni.id = ${nodeInstanceId} FOR UPDATE OF ni
    `;
    return row ? mapNode(row) : null;
  }

  async updateNode(state: WorkflowRuntimeNodeRecord): Promise<void> {
    await this.sql`
      UPDATE workflow_node_instance SET
        status = ${state.status}, output = ${state.output ? this.sql.json(jsonValue(state.output)) : null},
        error_class = ${state.errorClass ?? null}, error_code = ${state.errorCode ?? null},
        error_message = ${state.errorMessage ?? null}, available_at = ${state.availableAt},
        started_at = ${state.startedAt ?? null}, completed_at = ${state.completedAt ?? null},
        lease_owner = ${state.leaseOwner ?? null}, lease_expires_at = ${state.leaseExpiresAt ?? null},
        updated_at = now()
      WHERE id = ${state.nodeInstanceId} AND workflow_instance_id = ${state.instanceId}
    `;
  }

  async insertNodeAttempt(input: InsertWorkflowNodeAttempt): Promise<InsertNodeAttemptResult> {
    const [created] = await this.sql<Record<string, unknown>[]>`
      INSERT INTO workflow_node_instance (
        id, workflow_instance_id, workflow_version_id, workflow_node_id, status,
        attempt, max_attempts, idempotency_key, correlation_id, causation_id,
        input, available_at, deadline_at
      ) VALUES (
        ${input.nodeInstanceId}, ${input.instanceId}, ${input.workflowVersionId}, ${input.workflowNodeId}, 'ready',
        1, ${input.maxAttempts}, ${input.idempotencyKey}, ${input.correlationId}, ${input.causationId ?? null},
        ${this.sql.json(jsonValue(input.input))}, ${input.availableAt}, ${input.deadlineAt ?? null}
      )
      ON CONFLICT (workflow_instance_id, idempotency_key) DO NOTHING
      RETURNING id
    `;
    const id = created ? String(created.id) : null;
    const [row] = await this.sql<Record<string, unknown>[]>`
      SELECT ${this.sql.unsafe(NODE_COLUMNS)}
      FROM workflow_node_instance ni JOIN workflow_node wn ON wn.id = ni.workflow_node_id
      WHERE ${id ? this.sql`ni.id = ${id}` : this.sql`ni.workflow_instance_id = ${input.instanceId} AND ni.idempotency_key = ${input.idempotencyKey}`}
      LIMIT 1
    `;
    if (!row) throw new Error("Node-attempt kon na insert niet worden geladen.");
    return { node: mapNode(row), created: Boolean(created) };
  }

  async findCommandEvent(instanceId: string, idempotencyKey: string): Promise<WorkflowEngineEvent | null> {
    const [row] = await this.sql<Record<string, unknown>[]>`
      SELECT * FROM workflow_event
      WHERE workflow_instance_id = ${instanceId} AND idempotency_key = ${idempotencyKey}
      LIMIT 1
    `;
    return row ? mapEvent(row) : null;
  }

  async appendEvent(event: WorkflowEngineEvent): Promise<WorkflowEngineEvent> {
    const [row] = await this.sql<Record<string, unknown>[]>`
      INSERT INTO workflow_event (
        workflow_instance_id, workflow_node_instance_id, event_type, event_version,
        payload, actor_type, actor_id, actor_session_id, idempotency_key,
        correlation_id, causation_id, occurred_at
      ) VALUES (
        ${event.instanceId}, ${event.nodeInstanceId ?? null}, ${event.eventType}, ${event.eventVersion},
        ${this.sql.json(jsonValue(event.payload))}, ${event.actor.type}, ${event.actor.id},
        ${event.actor.sessionId ?? null}, ${event.idempotencyKey}, ${event.correlationId},
        ${event.causationId ?? null}, ${event.occurredAt}
      ) RETURNING *
    `;
    await this.enqueueOutbox({
      id: randomUUID(),
      workflowInstanceId: event.instanceId,
      ...(event.nodeInstanceId ? { workflowNodeInstanceId: event.nodeInstanceId } : {}),
      workflowEventId: String(row.id),
      kind: "engine",
      target: event.eventType,
      payload: {
        eventId: String(row.id),
        eventType: event.eventType,
        eventVersion: event.eventVersion,
        payload: event.payload,
      },
      idempotencyKey: `${event.idempotencyKey}:outbox`,
      correlationId: event.correlationId,
      ...(event.causationId ? { causationId: event.causationId } : {}),
      availableAt: event.occurredAt,
    });
    return mapEvent(row);
  }

  async listEvents(instanceId: string): Promise<readonly WorkflowEngineEvent[]> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT *
      FROM workflow_event
      WHERE workflow_instance_id = ${instanceId}
      ORDER BY sequence_number, occurred_at, id
    `;
    return rows.map(mapEvent);
  }

  async enqueueOutbox(input: WorkflowOutboxEnqueueInput): Promise<WorkflowRuntimeOutboxWriteResult> {
    const [created] = await this.sql<Record<string, unknown>[]>`
      INSERT INTO workflow_outbox (
        id, workflow_instance_id, workflow_node_instance_id, workflow_event_id,
        kind, target, payload, idempotency_key, correlation_id, causation_id,
        max_attempts, available_at
      ) VALUES (
        ${input.id}, ${input.workflowInstanceId}, ${input.workflowNodeInstanceId ?? null},
        ${input.workflowEventId ?? null}, ${input.kind}, ${input.target},
        ${this.sql.json(jsonValue(input.payload))}, ${input.idempotencyKey},
        ${input.correlationId}, ${input.causationId ?? null}, ${input.maxAttempts ?? 3},
        ${input.availableAt}
      )
      ON CONFLICT (workflow_instance_id, idempotency_key) DO NOTHING
      RETURNING *
    `;
    if (created) return { message: mapOutbox(created), created: true };
    const [existing] = await this.sql<Record<string, unknown>[]>`
      SELECT * FROM workflow_outbox
      WHERE workflow_instance_id = ${input.workflowInstanceId}
        AND idempotency_key = ${input.idempotencyKey}
      LIMIT 1
    `;
    if (!existing) throw new Error("Workflow outbox message kon na idempotente insert niet worden geladen.");
    return { message: mapOutbox(existing), created: false };
  }

  async listOutgoingEdges(workflowVersionId: string, sourceNodeId: string, sourcePort: string): Promise<readonly WorkflowRuntimeEdgeDefinition[]> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT id, workflow_version_id, edge_key, source_node_id, source_port,
             target_node_id, target_port, condition
      FROM workflow_edge
      WHERE workflow_version_id = ${workflowVersionId}
        AND source_node_id = ${sourceNodeId} AND source_port = ${sourcePort}
      ORDER BY edge_key, id
    `;
    return rows.map(mapEdge);
  }

  async listIncomingEdges(workflowVersionId: string, targetNodeId: string, targetPort: string): Promise<readonly WorkflowRuntimeEdgeDefinition[]> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT id, workflow_version_id, edge_key, source_node_id, source_port,
             target_node_id, target_port, condition
      FROM workflow_edge
      WHERE workflow_version_id = ${workflowVersionId}
        AND target_node_id = ${targetNodeId} AND target_port = ${targetPort}
      ORDER BY edge_key, id
    `;
    return rows.map(mapEdge);
  }

  async findRunnableNode(instanceId: string, availableAt: string): Promise<WorkflowRuntimeNodeRecord | null> {
    const [row] = await this.sql<Record<string, unknown>[]>`
      SELECT ${this.sql.unsafe(NODE_COLUMNS)}
      FROM workflow_node_instance ni JOIN workflow_node wn ON wn.id = ni.workflow_node_id
      WHERE ni.workflow_instance_id = ${instanceId} AND ni.status = 'ready'
        AND ni.available_at <= ${availableAt}
      ORDER BY ni.available_at, ni.created_at, ni.id
      LIMIT 1 FOR UPDATE OF ni SKIP LOCKED
    `;
    return row ? mapNode(row) : null;
  }

  async listNodes(instanceId: string): Promise<readonly WorkflowRuntimeNodeRecord[]> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT ${this.sql.unsafe(NODE_COLUMNS)}
      FROM workflow_node_instance ni JOIN workflow_node wn ON wn.id = ni.workflow_node_id
      WHERE ni.workflow_instance_id = ${instanceId}
      ORDER BY ni.created_at, ni.id
    `;
    return rows.map(mapNode);
  }

  async listVariables(instanceId: string): Promise<readonly WorkflowVariableRecord[]> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT id, workflow_instance_id, source_node_instance_id, name, data_type,
             value, classification, revision, idempotency_key, correlation_id
      FROM workflow_variable
      WHERE workflow_instance_id = ${instanceId}
      ORDER BY name, id
    `;
    return rows.map(mapVariable);
  }

  async writeVariable(input: WorkflowVariableWrite): Promise<WorkflowVariableWriteResult> {
    let created: Record<string, unknown> | undefined;
    try {
      [created] = await this.sql<Record<string, unknown>[]>`
        INSERT INTO workflow_variable (
          id, workflow_instance_id, source_node_instance_id, name, data_type,
          value, classification, idempotency_key, correlation_id
        ) VALUES (
          ${input.id}, ${input.instanceId}, ${input.sourceNodeInstanceId ?? null},
          ${input.assignment.name}, ${input.assignment.dataType},
          ${this.sql.json(jsonValue(input.assignment.value))},
          ${input.assignment.classification ?? "internal"},
          ${input.idempotencyKey}, ${input.correlationId}
        )
        ON CONFLICT (workflow_instance_id, idempotency_key) DO NOTHING
        RETURNING id, workflow_instance_id, source_node_instance_id, name, data_type,
                  value, classification, revision, idempotency_key, correlation_id
      `;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "23505") {
        throw new WorkflowVariableRuntimeError([{
          code: "variable_conflict",
          variableName: input.assignment.name,
          nodeInstanceId: input.sourceNodeInstanceId,
          message: `Variabele ${input.assignment.name} is al door een andere runtime-output geschreven.`,
        }]);
      }
      throw error;
    }
    if (created) return { variable: mapVariable(created), created: true };
    const [existing] = await this.sql<Record<string, unknown>[]>`
      SELECT id, workflow_instance_id, source_node_instance_id, name, data_type,
             value, classification, revision, idempotency_key, correlation_id
      FROM workflow_variable
      WHERE workflow_instance_id = ${input.instanceId} AND idempotency_key = ${input.idempotencyKey}
      LIMIT 1
    `;
    if (!existing) throw new Error("Runtimevariabele kon na idempotente insert niet worden geladen.");
    return { variable: mapVariable(existing), created: false };
  }

  async writeDataSnapshot(input: WorkflowRuntimeSnapshotWrite): Promise<WorkflowRuntimeSnapshotWriteResult> {
    const [created] = await this.sql<Record<string, unknown>[]>`
      INSERT INTO workflow_data_snapshot (
        id, workflow_instance_id, workflow_node_instance_id, resource_id,
        source_record_id, selected_fields, concurrency_token, snapshot_version,
        idempotency_key, correlation_id, causation_id, read_at
      ) VALUES (
        ${input.id}, ${input.instanceId}, ${input.sourceNodeInstanceId}, ${input.snapshot.resourceId},
        ${input.snapshot.sourceRecordId}, ${this.sql.json(jsonValue(input.snapshot.selectedFields))},
        ${input.snapshot.concurrencyToken}, ${input.snapshot.snapshotVersion}, ${input.idempotencyKey},
        ${input.correlationId}, ${input.causationId ?? null}, ${input.snapshot.readAt}
      )
      ON CONFLICT (workflow_instance_id, idempotency_key) DO NOTHING
      RETURNING *
    `;
    if (created) return { snapshot: mapSnapshot(created), created: true };
    const [existing] = await this.sql<Record<string, unknown>[]>`
      SELECT * FROM workflow_data_snapshot
      WHERE workflow_instance_id = ${input.instanceId} AND idempotency_key = ${input.idempotencyKey}
      LIMIT 1
    `;
    if (!existing) throw new Error("Runtime-snapshot kon na idempotente insert niet worden geladen.");
    return { snapshot: mapSnapshot(existing), created: false };
  }

  async loadDataSnapshot(instanceId: string, snapshotId: string): Promise<WorkflowRuntimeSnapshotRecord | null> {
    const [row] = await this.sql<Record<string, unknown>[]>`
      SELECT * FROM workflow_data_snapshot
      WHERE workflow_instance_id = ${instanceId} AND id = ${snapshotId}
      LIMIT 1
    `;
    return row ? mapSnapshot(row) : null;
  }

  async writeChangeIntent(input: WorkflowRuntimeChangeIntentWrite): Promise<WorkflowRuntimeChangeIntentWriteResult> {
    const [created] = await this.sql<Record<string, unknown>[]>`
      INSERT INTO workflow_change_intent (
        id, workflow_instance_id, workflow_node_instance_id, workflow_data_snapshot_id,
        adapter_id, resource_id, operation, status, payload, preconditions,
        dry_run_result, apply_result, idempotency_key, correlation_id, causation_id,
        effective_at
      ) VALUES (
        ${input.id}, ${input.instanceId}, ${input.nodeInstanceId}, ${input.snapshotId ?? null},
        ${input.adapterId}, ${input.resourceId}, ${input.operation}, ${input.status},
        ${this.sql.json(jsonValue(input.payload))}, ${this.sql.json(jsonValue(input.preconditions))},
        ${input.dryRunResult ? this.sql.json(jsonValue(input.dryRunResult)) : null},
        ${input.applyResult ? this.sql.json(jsonValue(input.applyResult)) : null},
        ${input.idempotencyKey}, ${input.correlationId}, ${input.causationId ?? null},
        ${input.effectiveAt ?? null}
      )
      ON CONFLICT (workflow_instance_id, idempotency_key) DO NOTHING
      RETURNING ${this.sql.unsafe(CHANGE_INTENT_COLUMNS)}
    `;
    if (created) return { intent: mapChangeIntent(created), created: true };
    const [existing] = await this.sql<Record<string, unknown>[]>`
      SELECT ${this.sql.unsafe(CHANGE_INTENT_COLUMNS)}
      FROM workflow_change_intent
      WHERE workflow_instance_id = ${input.instanceId} AND idempotency_key = ${input.idempotencyKey}
      LIMIT 1
    `;
    if (!existing) throw new Error("Workflow change intent kon na idempotente insert niet worden geladen.");
    return { intent: mapChangeIntent(existing), created: false };
  }

  async loadChangeIntent(instanceId: string, intentId: string): Promise<WorkflowRuntimeChangeIntentRecord | null> {
    const [row] = await this.sql<Record<string, unknown>[]>`
      SELECT ${this.sql.unsafe(CHANGE_INTENT_COLUMNS)}
      FROM workflow_change_intent
      WHERE workflow_instance_id = ${instanceId} AND id = ${intentId}
      LIMIT 1 FOR UPDATE
    `;
    return row ? mapChangeIntent(row) : null;
  }

  async updateChangeIntentApplyResult(input: WorkflowRuntimeChangeIntentApplyUpdate): Promise<WorkflowRuntimeChangeIntentRecord> {
    const [row] = await this.sql<Record<string, unknown>[]>`
      UPDATE workflow_change_intent SET
        status = ${input.status},
        dry_run_result = ${input.dryRunResult ? this.sql.json(jsonValue(input.dryRunResult)) : null},
        apply_result = ${this.sql.json(jsonValue(input.applyResult))},
        approved_by_user_id = COALESCE(${input.approvedByUserId ?? null}, approved_by_user_id),
        approved_at = COALESCE(${input.approvedAt ?? null}, approved_at),
        applied_at = COALESCE(${input.appliedAt ?? null}, applied_at),
        updated_at = now()
      WHERE workflow_instance_id = ${input.instanceId} AND id = ${input.intentId}
      RETURNING ${this.sql.unsafe(CHANGE_INTENT_COLUMNS)}
    `;
    if (!row) throw new Error("Workflow change intent kon niet worden bijgewerkt.");
    return mapChangeIntent(row);
  }

  async findRoleBinding(workflowVersionId: string, workflowRole: string, permission: string): Promise<WorkflowRuntimeRoleBindingRecord | null> {
    const [row] = await this.sql<Record<string, unknown>[]>`
      SELECT id, workflow_version_id, workflow_role, identity_group, permissions,
             tenant, business_unit, client_ids
      FROM workflow_role_binding
      WHERE workflow_version_id = ${workflowVersionId}
        AND workflow_role = ${workflowRole}
        AND ${permission} = ANY(permissions)
      ORDER BY identity_group, id
      LIMIT 1
    `;
    return row ? mapRoleBinding(row) : null;
  }

  async writeTask(input: InsertWorkflowTask): Promise<WorkflowTaskWriteResult> {
    const [created] = await this.sql<Record<string, unknown>[]>`
      INSERT INTO workflow_task (
        id, workflow_instance_id, workflow_version_id, workflow_node_instance_id,
        workflow_role_binding_id, title, instructions, assignee_group,
        idempotency_key, correlation_id, causation_id, deadline_at
      ) VALUES (
        ${input.id}, ${input.instanceId}, ${input.workflowVersionId}, ${input.nodeInstanceId},
        ${input.roleBindingId}, ${input.title}, ${input.instructions}, ${input.assigneeGroup},
        ${input.idempotencyKey}, ${input.correlationId}, ${input.causationId ?? null}, ${input.deadlineAt ?? null}
      )
      ON CONFLICT (workflow_instance_id, idempotency_key) DO NOTHING
      RETURNING id
    `;
    const [row] = await this.sql<Record<string, unknown>[]>`
      SELECT ${this.sql.unsafe(TASK_COLUMNS)}
      FROM workflow_task wt JOIN workflow_role_binding wrb ON wrb.id = wt.workflow_role_binding_id
      WHERE ${created ? this.sql`wt.id = ${String(created.id)}` : this.sql`wt.workflow_instance_id = ${input.instanceId} AND wt.idempotency_key = ${input.idempotencyKey}`}
      LIMIT 1
    `;
    if (!row) throw new Error("Workflowtaak kon na insert niet worden geladen.");
    return { task: mapTask(row), created: Boolean(created) };
  }

  async loadTask(taskId: string): Promise<WorkflowTaskRecord | null> {
    const [row] = await this.sql<Record<string, unknown>[]>`
      SELECT ${this.sql.unsafe(TASK_COLUMNS)}
      FROM workflow_task wt JOIN workflow_role_binding wrb ON wrb.id = wt.workflow_role_binding_id
      WHERE wt.id = ${taskId}
      LIMIT 1 FOR UPDATE OF wt
    `;
    return row ? mapTask(row) : null;
  }

  async updateTask(input: WorkflowTaskMutation): Promise<WorkflowTaskRecord> {
    const [row] = await this.sql<Record<string, unknown>[]>`
      UPDATE workflow_task SET
        status = ${input.status},
        claimed_by_user_id = ${input.claimedByUserId ?? null},
        outcome = ${input.outcome ?? null},
        form_data = ${input.formData ? this.sql.json(jsonValue(input.formData)) : null},
        completion_comment = ${input.completionComment ?? null},
        claimed_at = ${input.claimedAt ?? null},
        completed_at = ${input.completedAt ?? null},
        updated_at = now()
      WHERE id = ${input.taskId}
      RETURNING *
    `;
    if (!row) throw new Error("Workflowtaak kon niet worden bijgewerkt.");
    const [joined] = await this.sql<Record<string, unknown>[]>`
      SELECT ${this.sql.unsafe(TASK_COLUMNS)}
      FROM workflow_task wt JOIN workflow_role_binding wrb ON wrb.id = wt.workflow_role_binding_id
      WHERE wt.id = ${String(row.id)}
      LIMIT 1
    `;
    if (!joined) throw new Error("Workflowtaak kon na update niet worden geladen.");
    return mapTask(joined);
  }

  async listTasksForGroups(identityGroups: readonly string[], statuses: readonly WorkflowTaskStatus[] = ["open", "claimed"]): Promise<readonly WorkflowTaskRecord[]> {
    if (identityGroups.length === 0 || statuses.length === 0) return [];
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT ${this.sql.unsafe(TASK_COLUMNS)}
      FROM workflow_task wt JOIN workflow_role_binding wrb ON wrb.id = wt.workflow_role_binding_id
      WHERE wt.assignee_group = ANY(${this.sql.array([...identityGroups])})
        AND wt.status = ANY(${this.sql.array([...statuses])})
      ORDER BY wt.deadline_at NULLS LAST, wt.created_at, wt.id
    `;
    return rows.map(mapTask);
  }

  async listOverdueTasks(now: string): Promise<readonly WorkflowTaskRecord[]> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT ${this.sql.unsafe(TASK_COLUMNS)}
      FROM workflow_task wt JOIN workflow_role_binding wrb ON wrb.id = wt.workflow_role_binding_id
      WHERE wt.status IN ('open','claimed')
        AND wt.deadline_at IS NOT NULL
        AND wt.deadline_at <= ${now}
      ORDER BY wt.deadline_at, wt.created_at, wt.id
      FOR UPDATE OF wt SKIP LOCKED
    `;
    return rows.map(mapTask);
  }
}

export class PostgresWorkflowRuntimeStore implements WorkflowRuntimeStore {
  constructor(private readonly sql: SqlExecutor) {}

  async transaction<T>(work: (transaction: WorkflowRuntimeTransaction) => Promise<T>): Promise<T> {
    const result = await this.sql.begin(async (rawTransaction) => work(
      new PostgresWorkflowRuntimeTransaction(rawTransaction as unknown as Sql),
    ));
    return result as T;
  }
}

export function createPostgresWorkflowRuntimeStore(sql: SqlExecutor): PostgresWorkflowRuntimeStore {
  return new PostgresWorkflowRuntimeStore(sql);
}
