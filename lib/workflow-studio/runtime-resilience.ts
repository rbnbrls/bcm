export type WorkflowRuntimeSloPolicy = Readonly<{
  maxReadyNodeClaimLatencyMs: number;
  maxOutboxOldestPendingAgeMs: number;
  maxOutboxPendingMessages: number;
  maxOutboxDeadLetters: number;
  maxOpenTasks: number;
  rpoSeconds: number;
  rtoMinutes: number;
}>;

export type WorkflowRuntimeBackpressureMetrics = Readonly<{
  readyNodes: number;
  openTasks: number;
  outboxPending: number;
  outboxLeasedExpired: number;
  outboxDeadLetters: number;
  oldestOutboxPendingAgeMs: number;
}>;

export type WorkflowRuntimeBackpressureStatus = "healthy" | "degraded" | "blocked";

export type WorkflowRuntimeBackpressureIssue = Readonly<{
  code: "outbox_backlog" | "outbox_stale" | "dead_letters" | "expired_leases" | "task_backlog";
  severity: "warning" | "critical";
  message: string;
}>;

export type WorkflowRuntimeBackpressureEvaluation = Readonly<{
  status: WorkflowRuntimeBackpressureStatus;
  slo: WorkflowRuntimeSloPolicy;
  issues: readonly WorkflowRuntimeBackpressureIssue[];
}>;

export type WorkflowRuntimeScaleIndexAudit = Readonly<{
  ok: boolean;
  missing: readonly string[];
}>;

export const DEFAULT_WORKFLOW_RUNTIME_SLO: WorkflowRuntimeSloPolicy = Object.freeze({
  maxReadyNodeClaimLatencyMs: 250,
  maxOutboxOldestPendingAgeMs: 5 * 60_000,
  maxOutboxPendingMessages: 5_000,
  maxOutboxDeadLetters: 0,
  maxOpenTasks: 10_000,
  rpoSeconds: 0,
  rtoMinutes: 15,
});

export const WORKFLOW_RUNTIME_REQUIRED_INDEXES = Object.freeze([
  "idx_workflow_instance_version_status",
  "idx_workflow_instance_scope_status",
  "idx_workflow_node_instance_ready",
  "idx_workflow_node_instance_instance",
  "idx_workflow_task_assignee_status",
  "idx_workflow_intent_status_retry",
  "idx_workflow_outbox_ready",
  "idx_workflow_event_instance_sequence",
]);

function issue(input: WorkflowRuntimeBackpressureIssue): WorkflowRuntimeBackpressureIssue {
  return Object.freeze(input);
}

export function evaluateWorkflowRuntimeBackpressure(
  metrics: WorkflowRuntimeBackpressureMetrics,
  slo: WorkflowRuntimeSloPolicy = DEFAULT_WORKFLOW_RUNTIME_SLO,
): WorkflowRuntimeBackpressureEvaluation {
  const issues: WorkflowRuntimeBackpressureIssue[] = [];
  if (metrics.outboxPending > slo.maxOutboxPendingMessages) {
    issues.push(issue({
      code: "outbox_backlog",
      severity: "warning",
      message: `Outbox pending ${metrics.outboxPending} overschrijdt SLO ${slo.maxOutboxPendingMessages}.`,
    }));
  }
  if (metrics.oldestOutboxPendingAgeMs > slo.maxOutboxOldestPendingAgeMs) {
    issues.push(issue({
      code: "outbox_stale",
      severity: "critical",
      message: `Oudste outboxbericht wacht ${metrics.oldestOutboxPendingAgeMs} ms; SLO is ${slo.maxOutboxOldestPendingAgeMs} ms.`,
    }));
  }
  if (metrics.outboxDeadLetters > slo.maxOutboxDeadLetters) {
    issues.push(issue({
      code: "dead_letters",
      severity: "critical",
      message: `${metrics.outboxDeadLetters} outboxberichten staan in dead letter.`,
    }));
  }
  if (metrics.outboxLeasedExpired > 0) {
    issues.push(issue({
      code: "expired_leases",
      severity: "warning",
      message: `${metrics.outboxLeasedExpired} workerleases zijn verlopen en moeten opnieuw claimbaar zijn.`,
    }));
  }
  if (metrics.openTasks > slo.maxOpenTasks) {
    issues.push(issue({
      code: "task_backlog",
      severity: "warning",
      message: `Open taakvolume ${metrics.openTasks} overschrijdt SLO ${slo.maxOpenTasks}.`,
    }));
  }

  return Object.freeze({
    status: issues.some((item) => item.severity === "critical") ? "blocked" : issues.length > 0 ? "degraded" : "healthy",
    slo,
    issues: Object.freeze(issues),
  });
}

export function auditWorkflowRuntimeScaleIndexes(sqlText: string): WorkflowRuntimeScaleIndexAudit {
  const missing = WORKFLOW_RUNTIME_REQUIRED_INDEXES.filter((indexName) => !sqlText.includes(indexName));
  return Object.freeze({
    ok: missing.length === 0,
    missing: Object.freeze(missing),
  });
}
