import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_WORKFLOW_RUNTIME_SLO,
  auditWorkflowRuntimeScaleIndexes,
  evaluateWorkflowRuntimeBackpressure,
} from "@/lib/workflow-studio/runtime-resilience";

describe("workflow runtime resilience", () => {
  it("keeps the default SLO explicit for RPO/RTO and queue health", () => {
    expect(DEFAULT_WORKFLOW_RUNTIME_SLO).toMatchObject({
      maxReadyNodeClaimLatencyMs: 250,
      maxOutboxDeadLetters: 0,
      rpoSeconds: 0,
      rtoMinutes: 15,
    });
  });

  it("marks healthy queues when metrics stay within SLO", () => {
    const result = evaluateWorkflowRuntimeBackpressure({
      readyNodes: 42,
      openTasks: 500,
      outboxPending: 250,
      outboxLeasedExpired: 0,
      outboxDeadLetters: 0,
      oldestOutboxPendingAgeMs: 30_000,
    });

    expect(result).toEqual({
      status: "healthy",
      slo: DEFAULT_WORKFLOW_RUNTIME_SLO,
      issues: [],
    });
  });

  it("escalates stale outbox and dead letters as blocked recovery state", () => {
    const result = evaluateWorkflowRuntimeBackpressure({
      readyNodes: 10,
      openTasks: 12_000,
      outboxPending: 7_000,
      outboxLeasedExpired: 3,
      outboxDeadLetters: 1,
      oldestOutboxPendingAgeMs: 600_000,
    });

    expect(result.status).toBe("blocked");
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "outbox_backlog",
      "outbox_stale",
      "dead_letters",
      "expired_leases",
      "task_backlog",
    ]);
  });

  it("guards required runtime scale indexes in the database schema", () => {
    const sql = readFileSync("db/init.sql", "utf8");

    expect(auditWorkflowRuntimeScaleIndexes(sql)).toEqual({ ok: true, missing: [] });
  });
});
