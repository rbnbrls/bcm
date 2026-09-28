import { describe, expect, it } from "vitest";

import {
  WorkflowOutboxWorker,
  workflowOutboxNextRetryAt,
  type WorkflowOutboxClaimInput,
  type WorkflowOutboxDeliveryInput,
  type WorkflowOutboxEnqueueInput,
  type WorkflowOutboxFailureInput,
  type WorkflowOutboxMessage,
  type WorkflowOutboxStore,
} from "@/lib/workflow-studio/runtime-outbox";

function clone<T>(value: T): T {
  return structuredClone(value);
}

const now = "2026-08-11T08:00:00.000Z";

class MemoryOutboxStore implements WorkflowOutboxStore {
  messages = new Map<string, WorkflowOutboxMessage>();

  async enqueue(input: WorkflowOutboxEnqueueInput): Promise<WorkflowOutboxMessage> {
    const duplicate = [...this.messages.values()].find((message) => (
      message.workflowInstanceId === input.workflowInstanceId && message.idempotencyKey === input.idempotencyKey
    ));
    if (duplicate) return clone(duplicate);
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
    this.messages.set(message.id, message);
    return clone(message);
  }

  async claimNext(input: WorkflowOutboxClaimInput): Promise<WorkflowOutboxMessage | null> {
    const candidate = [...this.messages.values()].find((message) => (
      ["pending", "leased"].includes(message.status)
      && message.availableAt <= input.now
      && (!message.leaseExpiresAt || message.leaseExpiresAt <= input.now)
      && (!input.kinds?.length || input.kinds.includes(message.kind))
    ));
    if (!candidate) return null;
    const leased: WorkflowOutboxMessage = {
      ...candidate,
      status: "leased",
      leaseOwner: input.workerId,
      leaseExpiresAt: new Date(Date.parse(input.now) + input.leaseDurationMs).toISOString(),
      updatedAt: input.now,
    };
    this.messages.set(leased.id, leased);
    return clone(leased);
  }

  async markDelivered(input: WorkflowOutboxDeliveryInput): Promise<WorkflowOutboxMessage> {
    const current = this.messages.get(input.messageId);
    if (!current || current.status !== "leased" || current.leaseOwner !== input.workerId) throw new Error("not leased");
    const delivered: WorkflowOutboxMessage = {
      ...current,
      status: "delivered",
      deliveredAt: input.deliveredAt,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      updatedAt: input.deliveredAt,
    };
    this.messages.set(delivered.id, delivered);
    return clone(delivered);
  }

  async markFailed(input: WorkflowOutboxFailureInput): Promise<WorkflowOutboxMessage> {
    const current = this.messages.get(input.messageId);
    if (!current || current.status !== "leased" || current.leaseOwner !== input.workerId) throw new Error("not leased");
    const terminal = current.attempt >= current.maxAttempts;
    const failed: WorkflowOutboxMessage = {
      ...current,
      status: terminal ? "dead_letter" : "pending",
      attempt: terminal ? current.attempt : current.attempt + 1,
      availableAt: terminal ? current.availableAt : workflowOutboxNextRetryAt(current.attempt, input.failedAt),
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      deadLetterAt: terminal ? input.failedAt : undefined,
      lastError: input.error,
      updatedAt: input.failedAt,
    };
    this.messages.set(failed.id, failed);
    return clone(failed);
  }
}

function message(overrides: Partial<WorkflowOutboxEnqueueInput> = {}): WorkflowOutboxEnqueueInput {
  return {
    id: "message-1",
    workflowInstanceId: "instance-1",
    workflowEventId: "event-1",
    kind: "engine",
    target: "workflow.node.activated",
    payload: { eventId: "event-1" },
    idempotencyKey: "event-1:outbox",
    correlationId: "correlation-1",
    availableAt: now,
    ...overrides,
  };
}

describe("workflow runtime outbox worker", () => {
  it("delivers an available message once and clears the lease", async () => {
    const store = new MemoryOutboxStore();
    await store.enqueue(message());
    const handled: WorkflowOutboxMessage[] = [];
    const worker = new WorkflowOutboxWorker(store, {
      engine: async (entry) => { handled.push(entry); },
      notification: async () => {},
      integration: async () => {},
    });

    const result = await worker.runOnce({ workerId: "worker-1", leaseDurationMs: 60_000, now });

    expect(result).toMatchObject({ status: "delivered", message: { status: "delivered", deliveredAt: now } });
    expect(handled).toEqual([expect.objectContaining({ id: "message-1", status: "leased", leaseOwner: "worker-1" })]);
    expect(await worker.runOnce({ workerId: "worker-1", leaseDurationMs: 60_000, now })).toEqual({ status: "idle" });
  });

  it("schedules retry with bounded backoff after a transient delivery failure", async () => {
    const store = new MemoryOutboxStore();
    await store.enqueue(message());
    const worker = new WorkflowOutboxWorker(store, {
      engine: async () => { throw new Error("temporary outage"); },
      notification: async () => {},
      integration: async () => {},
    });

    const result = await worker.runOnce({ workerId: "worker-1", leaseDurationMs: 60_000, now });

    expect(result).toMatchObject({
      status: "retry_scheduled",
      message: {
        status: "pending",
        attempt: 2,
        lastError: "temporary outage",
        availableAt: "2026-08-11T08:00:01.000Z",
      },
    });
  });

  it("moves poison messages to dead letter when attempts are exhausted", async () => {
    const store = new MemoryOutboxStore();
    const created = await store.enqueue(message({ maxAttempts: 1 }));
    store.messages.set(created.id, { ...created, attempt: 1, maxAttempts: 1 });
    const worker = new WorkflowOutboxWorker(store, {
      engine: async () => { throw new Error("poison"); },
      notification: async () => {},
      integration: async () => {},
    });

    const result = await worker.runOnce({ workerId: "worker-1", leaseDurationMs: 60_000, now });

    expect(result).toMatchObject({
      status: "dead_lettered",
      message: { status: "dead_letter", attempt: 1, deadLetterAt: now, lastError: "poison" },
    });
  });

  it("deduplicates enqueue by instance and idempotency key", async () => {
    const store = new MemoryOutboxStore();

    const first = await store.enqueue(message());
    const duplicate = await store.enqueue(message({ id: "message-2", payload: { eventId: "event-2" } }));

    expect(duplicate).toEqual(first);
    expect(store.messages).toHaveLength(1);
  });

  it("processes bounded batches with worker concurrency and aggregate counts", async () => {
    const store = new MemoryOutboxStore();
    for (let index = 1; index <= 5; index += 1) {
      await store.enqueue(message({
        id: `message-${index}`,
        workflowEventId: `event-${index}`,
        idempotencyKey: `event-${index}:outbox`,
      }));
    }
    const worker = new WorkflowOutboxWorker(store, {
      engine: async () => {},
      notification: async () => {},
      integration: async () => {},
    });

    const result = await worker.runBatch({
      workerId: "worker",
      leaseDurationMs: 60_000,
      now,
      maxMessages: 5,
      concurrency: 2,
    });

    expect(result).toMatchObject({ claimed: 5, delivered: 5, retryScheduled: 0, deadLettered: 0 });
    expect([...store.messages.values()].every((entry) => entry.status === "delivered")).toBe(true);
    expect(new Set([...store.messages.values()].map((entry) => entry.leaseOwner))).toEqual(new Set([undefined]));
  });
});
