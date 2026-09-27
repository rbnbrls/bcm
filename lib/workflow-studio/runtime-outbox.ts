import type { JSONValue, Sql } from "postgres";

import type { SqlExecutor } from "@/lib/workflow-studio/definition-repository";
import { retryDelayMs } from "@/lib/workflow-studio/runtime-state-machine";

type JsonObject = Readonly<Record<string, unknown>>;

export type WorkflowOutboxKind = "engine" | "notification" | "integration";
export type WorkflowOutboxStatus = "pending" | "leased" | "delivered" | "dead_letter";

export type WorkflowOutboxMessage = Readonly<{
  id: string;
  workflowInstanceId: string;
  workflowNodeInstanceId?: string;
  workflowEventId?: string;
  kind: WorkflowOutboxKind;
  target: string;
  status: WorkflowOutboxStatus;
  payload: JsonObject;
  idempotencyKey: string;
  correlationId: string;
  causationId?: string;
  attempt: number;
  maxAttempts: number;
  availableAt: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  deliveredAt?: string;
  deadLetterAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}>;

export type WorkflowOutboxEnqueueInput = Readonly<{
  id: string;
  workflowInstanceId: string;
  workflowNodeInstanceId?: string;
  workflowEventId?: string;
  kind: WorkflowOutboxKind;
  target: string;
  payload: JsonObject;
  idempotencyKey: string;
  correlationId: string;
  causationId?: string;
  maxAttempts?: number;
  availableAt: string;
}>;

export type WorkflowOutboxClaimInput = Readonly<{
  workerId: string;
  leaseDurationMs: number;
  now: string;
  kinds?: readonly WorkflowOutboxKind[];
}>;

export type WorkflowOutboxFailureInput = Readonly<{
  messageId: string;
  workerId: string;
  error: string;
  failedAt: string;
}>;

export type WorkflowOutboxDeliveryInput = Readonly<{
  messageId: string;
  workerId: string;
  deliveredAt: string;
}>;

export interface WorkflowOutboxStore {
  enqueue(input: WorkflowOutboxEnqueueInput): Promise<WorkflowOutboxMessage>;
  claimNext(input: WorkflowOutboxClaimInput): Promise<WorkflowOutboxMessage | null>;
  markDelivered(input: WorkflowOutboxDeliveryInput): Promise<WorkflowOutboxMessage>;
  markFailed(input: WorkflowOutboxFailureInput): Promise<WorkflowOutboxMessage>;
}

export type WorkflowOutboxHandler = (message: WorkflowOutboxMessage) => Promise<void>;

export type WorkflowOutboxWorkerResult =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "delivered"; message: WorkflowOutboxMessage }>
  | Readonly<{ status: "retry_scheduled" | "dead_lettered"; message: WorkflowOutboxMessage; error: string }>;

export type WorkflowOutboxWorkerBatchInput = WorkflowOutboxClaimInput & Readonly<{
  maxMessages: number;
  concurrency?: number;
}>;

export type WorkflowOutboxWorkerBatchResult = Readonly<{
  claimed: number;
  delivered: number;
  retryScheduled: number;
  deadLettered: number;
  idle: number;
  results: readonly WorkflowOutboxWorkerResult[];
}>;

export class WorkflowOutboxWorker {
  constructor(
    private readonly store: WorkflowOutboxStore,
    private readonly handlers: Readonly<Record<WorkflowOutboxKind, WorkflowOutboxHandler>>,
  ) {}

  async runOnce(input: WorkflowOutboxClaimInput): Promise<WorkflowOutboxWorkerResult> {
    const message = await this.store.claimNext(input);
    if (!message) return { status: "idle" };
    try {
      await this.handlers[message.kind](message);
      return { status: "delivered", message: await this.store.markDelivered({
        messageId: message.id,
        workerId: input.workerId,
        deliveredAt: input.now,
      }) };
    } catch (error) {
      const failed = await this.store.markFailed({
        messageId: message.id,
        workerId: input.workerId,
        failedAt: input.now,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        status: failed.status === "dead_letter" ? "dead_lettered" : "retry_scheduled",
        message: failed,
        error: failed.lastError ?? "Delivery failed.",
      };
    }
  }

  async runBatch(input: WorkflowOutboxWorkerBatchInput): Promise<WorkflowOutboxWorkerBatchResult> {
    if (!Number.isInteger(input.maxMessages) || input.maxMessages < 1) {
      throw new Error("maxMessages moet een positief geheel getal zijn.");
    }
    const concurrency = Math.max(1, Math.min(input.concurrency ?? 1, input.maxMessages));
    let scheduled = 0;
    const results: WorkflowOutboxWorkerResult[] = [];

    const runLane = async (lane: number): Promise<void> => {
      while (scheduled < input.maxMessages) {
        scheduled += 1;
        const result = await this.runOnce({
          ...input,
          workerId: `${input.workerId}:${lane}`,
        });
        results.push(result);
        if (result.status === "idle") return;
      }
    };

    await Promise.all(Array.from({ length: concurrency }, (_, index) => runLane(index + 1)));

    return Object.freeze({
      claimed: results.filter((result) => result.status !== "idle").length,
      delivered: results.filter((result) => result.status === "delivered").length,
      retryScheduled: results.filter((result) => result.status === "retry_scheduled").length,
      deadLettered: results.filter((result) => result.status === "dead_lettered").length,
      idle: results.filter((result) => result.status === "idle").length,
      results: Object.freeze([...results]),
    });
  }
}

export function workflowOutboxNextRetryAt(attempt: number, failedAt: string): string {
  return new Date(Date.parse(failedAt) + retryDelayMs(attempt)).toISOString();
}

function jsonValue(value: unknown): JSONValue {
  return JSON.parse(JSON.stringify(value)) as JSONValue;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function optionalString(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

function mapOutbox(row: Record<string, unknown>): WorkflowOutboxMessage {
  return {
    id: String(row.id),
    workflowInstanceId: String(row.workflow_instance_id),
    ...(optionalString(row.workflow_node_instance_id) ? { workflowNodeInstanceId: optionalString(row.workflow_node_instance_id)! } : {}),
    ...(optionalString(row.workflow_event_id) ? { workflowEventId: optionalString(row.workflow_event_id)! } : {}),
    kind: String(row.kind) as WorkflowOutboxKind,
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

export class PostgresWorkflowOutboxStore implements WorkflowOutboxStore {
  constructor(private readonly sql: SqlExecutor) {}

  async enqueue(input: WorkflowOutboxEnqueueInput): Promise<WorkflowOutboxMessage> {
    return this.sql.begin(async (tx) => new PostgresWorkflowOutboxTransaction(tx as unknown as Sql).enqueue(input)) as Promise<WorkflowOutboxMessage>;
  }

  async claimNext(input: WorkflowOutboxClaimInput): Promise<WorkflowOutboxMessage | null> {
    return this.sql.begin(async (tx) => new PostgresWorkflowOutboxTransaction(tx as unknown as Sql).claimNext(input)) as Promise<WorkflowOutboxMessage | null>;
  }

  async markDelivered(input: WorkflowOutboxDeliveryInput): Promise<WorkflowOutboxMessage> {
    return this.sql.begin(async (tx) => new PostgresWorkflowOutboxTransaction(tx as unknown as Sql).markDelivered(input)) as Promise<WorkflowOutboxMessage>;
  }

  async markFailed(input: WorkflowOutboxFailureInput): Promise<WorkflowOutboxMessage> {
    return this.sql.begin(async (tx) => new PostgresWorkflowOutboxTransaction(tx as unknown as Sql).markFailed(input)) as Promise<WorkflowOutboxMessage>;
  }
}

export class PostgresWorkflowOutboxTransaction implements WorkflowOutboxStore {
  constructor(private readonly sql: Sql) {}

  async enqueue(input: WorkflowOutboxEnqueueInput): Promise<WorkflowOutboxMessage> {
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
    if (created) return mapOutbox(created);
    const [existing] = await this.sql<Record<string, unknown>[]>`
      SELECT * FROM workflow_outbox
      WHERE workflow_instance_id = ${input.workflowInstanceId}
        AND idempotency_key = ${input.idempotencyKey}
      LIMIT 1
    `;
    if (!existing) throw new Error("Workflow outbox message kon na idempotente insert niet worden geladen.");
    return mapOutbox(existing);
  }

  async claimNext(input: WorkflowOutboxClaimInput): Promise<WorkflowOutboxMessage | null> {
    const leaseExpiresAt = new Date(Date.parse(input.now) + input.leaseDurationMs).toISOString();
    const [row] = await this.sql<Record<string, unknown>[]>`
      WITH picked AS (
        SELECT id FROM workflow_outbox
        WHERE status IN ('pending','leased')
          AND available_at <= ${input.now}
          AND (lease_expires_at IS NULL OR lease_expires_at <= ${input.now})
          AND ${input.kinds?.length ? this.sql`kind = ANY(${this.sql.array([...input.kinds])})` : this.sql`true`}
        ORDER BY available_at, created_at, id
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE workflow_outbox o SET
        status = 'leased',
        lease_owner = ${input.workerId},
        lease_expires_at = ${leaseExpiresAt},
        updated_at = now()
      FROM picked
      WHERE o.id = picked.id
      RETURNING o.*
    `;
    return row ? mapOutbox(row) : null;
  }

  async markDelivered(input: WorkflowOutboxDeliveryInput): Promise<WorkflowOutboxMessage> {
    const [row] = await this.sql<Record<string, unknown>[]>`
      UPDATE workflow_outbox SET
        status = 'delivered',
        delivered_at = ${input.deliveredAt},
        lease_owner = NULL,
        lease_expires_at = NULL,
        updated_at = now()
      WHERE id = ${input.messageId}
        AND status = 'leased'
        AND lease_owner = ${input.workerId}
      RETURNING *
    `;
    if (!row) throw new Error("Workflow outbox delivery kon niet worden bevestigd.");
    return mapOutbox(row);
  }

  async markFailed(input: WorkflowOutboxFailureInput): Promise<WorkflowOutboxMessage> {
    const [current] = await this.sql<Record<string, unknown>[]>`
      SELECT * FROM workflow_outbox
      WHERE id = ${input.messageId}
        AND status = 'leased'
        AND lease_owner = ${input.workerId}
      FOR UPDATE
    `;
    if (!current) throw new Error("Workflow outbox failure kon niet worden vastgelegd.");
    const attempt = Number(current.attempt);
    const maxAttempts = Number(current.max_attempts);
    const terminal = attempt >= maxAttempts;
    const availableAt = terminal ? String(current.available_at) : workflowOutboxNextRetryAt(attempt, input.failedAt);
    const [row] = await this.sql<Record<string, unknown>[]>`
      UPDATE workflow_outbox SET
        status = ${terminal ? "dead_letter" : "pending"},
        attempt = ${terminal ? attempt : attempt + 1},
        available_at = ${availableAt},
        lease_owner = NULL,
        lease_expires_at = NULL,
        dead_letter_at = ${terminal ? input.failedAt : null},
        last_error = ${input.error.slice(0, 2000)},
        updated_at = now()
      WHERE id = ${input.messageId}
      RETURNING *
    `;
    if (!row) throw new Error("Workflow outbox failure-update kon niet worden teruggelezen.");
    return mapOutbox(row);
  }
}

export function createPostgresWorkflowOutboxStore(sql: SqlExecutor): PostgresWorkflowOutboxStore {
  return new PostgresWorkflowOutboxStore(sql);
}
