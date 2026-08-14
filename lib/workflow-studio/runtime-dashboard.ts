import type { SqlExecutor } from "@/lib/workflow-studio/definition-repository";

export type WorkflowRuntimeDashboardStatusCounts = Readonly<{
  active: number;
  waiting: number;
  blocked: number;
  failed: number;
}>;

export type WorkflowRuntimeDashboardLabel = Readonly<{
  workflowName: string;
  workflowVersionId: string;
  versionNumber: number;
  nodeKey?: string;
  blockType?: string;
}>;

export type WorkflowRuntimeDashboardTask = WorkflowRuntimeDashboardLabel & Readonly<{
  taskId: string;
  instanceId: string;
  title: string;
  status: "open" | "claimed" | "completed" | "cancelled" | "expired";
  workflowRole: string;
  assigneeGroup: string;
  createdAt: string;
  deadlineAt?: string;
  ageMinutes: number;
  overdueMinutes?: number;
}>;

export type WorkflowRuntimeDashboardDeadLetter = WorkflowRuntimeDashboardLabel & Readonly<{
  messageId: string;
  instanceId: string;
  kind: "engine" | "notification" | "integration";
  target: string;
  attempt: number;
  maxAttempts: number;
  deadLetterAt?: string;
  lastError?: string;
}>;

export type WorkflowRuntimeDashboardAdapterError = WorkflowRuntimeDashboardLabel & Readonly<{
  intentId: string;
  instanceId: string;
  adapterId: string;
  resourceId: string;
  operation: "CREATE" | "UPDATE" | "RETIRE";
  status: "conflicted" | "failed";
  errorCode?: string;
  errorMessage?: string;
  updatedAt: string;
}>;

export type WorkflowRuntimeDashboardCatalogChangeMetric = Readonly<{
  resourceId: string;
  operation: "CREATE" | "UPDATE" | "RETIRE";
  status: string;
  count: number;
}>;

export type WorkflowRuntimeDashboardCatalogChange = WorkflowRuntimeDashboardLabel & Readonly<{
  intentId: string;
  instanceId: string;
  resourceId: string;
  operation: "CREATE" | "UPDATE" | "RETIRE";
  status: string;
  targetPrimaryAccountId?: string;
  serviceCode?: string;
  updatedAt: string;
}>;

export type WorkflowRuntimeDashboardAlertKind = "blocked" | "failed" | "sla_overdue" | "dead_letter" | "adapter_error";
export type WorkflowRuntimeDashboardAlertSeverity = "warning" | "critical";

export type WorkflowRuntimeDashboardAlert = WorkflowRuntimeDashboardLabel & Readonly<{
  kind: WorkflowRuntimeDashboardAlertKind;
  severity: WorkflowRuntimeDashboardAlertSeverity;
  instanceId?: string;
  subjectId?: string;
  status?: string;
  message: string;
  occurredAt?: string;
}>;

export type WorkflowRuntimeDashboardModel = Readonly<{
  generatedAt: string;
  instanceCounts: WorkflowRuntimeDashboardStatusCounts;
  nodeCounts: WorkflowRuntimeDashboardStatusCounts;
  oldestTasks: readonly WorkflowRuntimeDashboardTask[];
  overdueTasks: readonly WorkflowRuntimeDashboardTask[];
  deadLetters: readonly WorkflowRuntimeDashboardDeadLetter[];
  adapterErrors: readonly WorkflowRuntimeDashboardAdapterError[];
  catalogChangeMetrics: readonly WorkflowRuntimeDashboardCatalogChangeMetric[];
  recentCatalogChanges: readonly WorkflowRuntimeDashboardCatalogChange[];
  alerts: readonly WorkflowRuntimeDashboardAlert[];
}>;

export interface WorkflowRuntimeDashboardReader {
  countInstances(): Promise<WorkflowRuntimeDashboardStatusCounts>;
  countNodes(): Promise<WorkflowRuntimeDashboardStatusCounts>;
  listOldestTasks(now: string): Promise<readonly WorkflowRuntimeDashboardTask[]>;
  listOverdueTasks(now: string): Promise<readonly WorkflowRuntimeDashboardTask[]>;
  listDeadLetters(): Promise<readonly WorkflowRuntimeDashboardDeadLetter[]>;
  listAdapterErrors(): Promise<readonly WorkflowRuntimeDashboardAdapterError[]>;
  listCatalogChangeMetrics(): Promise<readonly WorkflowRuntimeDashboardCatalogChangeMetric[]>;
  listRecentCatalogChanges(): Promise<readonly WorkflowRuntimeDashboardCatalogChange[]>;
}

export class WorkflowRuntimeDashboardService {
  constructor(private readonly reader: WorkflowRuntimeDashboardReader) {}

  async load(input: { now: string }): Promise<WorkflowRuntimeDashboardModel> {
    const [
      instanceCounts,
      nodeCounts,
      oldestTasks,
      overdueTasks,
      deadLetters,
      adapterErrors,
      catalogChangeMetrics,
      recentCatalogChanges,
    ] = await Promise.all([
      this.reader.countInstances(),
      this.reader.countNodes(),
      this.reader.listOldestTasks(input.now),
      this.reader.listOverdueTasks(input.now),
      this.reader.listDeadLetters(),
      this.reader.listAdapterErrors(),
      this.reader.listCatalogChangeMetrics(),
      this.reader.listRecentCatalogChanges(),
    ]);
    return Object.freeze({
      generatedAt: input.now,
      instanceCounts,
      nodeCounts,
      oldestTasks,
      overdueTasks,
      deadLetters,
      adapterErrors,
      catalogChangeMetrics,
      recentCatalogChanges,
      alerts: Object.freeze([
        ...countAlerts(instanceCounts, nodeCounts),
        ...overdueTasks.slice(0, 10).map(overdueTaskAlert),
        ...deadLetters.slice(0, 10).map(deadLetterAlert),
        ...adapterErrors.slice(0, 10).map(adapterErrorAlert),
      ]),
    });
  }
}

function countAlerts(
  instanceCounts: WorkflowRuntimeDashboardStatusCounts,
  nodeCounts: WorkflowRuntimeDashboardStatusCounts,
): readonly WorkflowRuntimeDashboardAlert[] {
  const alerts: WorkflowRuntimeDashboardAlert[] = [];
  if (instanceCounts.blocked > 0 || nodeCounts.blocked > 0) {
    alerts.push({
      kind: "blocked",
      severity: "warning",
      workflowName: "Alle workflows",
      workflowVersionId: "all",
      versionNumber: 0,
      status: "needs_intervention",
      message: `${instanceCounts.blocked} instances en ${nodeCounts.blocked} nodes vragen interventie.`,
    });
  }
  if (instanceCounts.failed > 0 || nodeCounts.failed > 0) {
    alerts.push({
      kind: "failed",
      severity: "critical",
      workflowName: "Alle workflows",
      workflowVersionId: "all",
      versionNumber: 0,
      status: "failed",
      message: `${instanceCounts.failed} instances en ${nodeCounts.failed} nodes zijn mislukt.`,
    });
  }
  return alerts;
}

function overdueTaskAlert(task: WorkflowRuntimeDashboardTask): WorkflowRuntimeDashboardAlert {
  return {
    kind: "sla_overdue",
    severity: "warning",
    workflowName: task.workflowName,
    workflowVersionId: task.workflowVersionId,
    versionNumber: task.versionNumber,
    nodeKey: task.nodeKey,
    blockType: task.blockType,
    instanceId: task.instanceId,
    subjectId: task.taskId,
    status: task.status,
    occurredAt: task.deadlineAt,
    message: `SLA verlopen voor taak ${task.title}.`,
  };
}

function deadLetterAlert(message: WorkflowRuntimeDashboardDeadLetter): WorkflowRuntimeDashboardAlert {
  return {
    kind: "dead_letter",
    severity: "critical",
    workflowName: message.workflowName,
    workflowVersionId: message.workflowVersionId,
    versionNumber: message.versionNumber,
    nodeKey: message.nodeKey,
    blockType: message.blockType,
    instanceId: message.instanceId,
    subjectId: message.messageId,
    status: "dead_letter",
    occurredAt: message.deadLetterAt,
    message: `${message.kind} delivery naar ${message.target} staat in dead letter.`,
  };
}

function adapterErrorAlert(error: WorkflowRuntimeDashboardAdapterError): WorkflowRuntimeDashboardAlert {
  return {
    kind: "adapter_error",
    severity: error.status === "failed" ? "critical" : "warning",
    workflowName: error.workflowName,
    workflowVersionId: error.workflowVersionId,
    versionNumber: error.versionNumber,
    nodeKey: error.nodeKey,
    blockType: error.blockType,
    instanceId: error.instanceId,
    subjectId: error.intentId,
    status: error.status,
    occurredAt: error.updatedAt,
    message: `${error.adapterId} ${error.operation} op ${error.resourceId} eindigde als ${error.status}.`,
  };
}

function countRows(rows: readonly Record<string, unknown>[]): WorkflowRuntimeDashboardStatusCounts {
  const counts: Record<keyof WorkflowRuntimeDashboardStatusCounts, number> = {
    active: 0,
    waiting: 0,
    blocked: 0,
    failed: 0,
  };
  for (const row of rows) {
    const bucket = String(row.bucket) as keyof WorkflowRuntimeDashboardStatusCounts;
    if (bucket in counts) counts[bucket] = Number(row.count);
  }
  return Object.freeze(counts);
}

function optionalString(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

function jsonField(value: unknown, key: string): string | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? optionalString((value as Record<string, unknown>)[key])
    : undefined;
}

function mapLabels(row: Record<string, unknown>): WorkflowRuntimeDashboardLabel {
  return {
    workflowName: String(row.workflow_name),
    workflowVersionId: String(row.workflow_version_id),
    versionNumber: Number(row.version_number),
    ...(optionalString(row.node_key) ? { nodeKey: optionalString(row.node_key)! } : {}),
    ...(optionalString(row.block_type) ? { blockType: optionalString(row.block_type)! } : {}),
  };
}

function mapTask(row: Record<string, unknown>): WorkflowRuntimeDashboardTask {
  const overdueMinutes = Number(row.overdue_minutes);
  return {
    ...mapLabels(row),
    taskId: String(row.task_id),
    instanceId: String(row.workflow_instance_id),
    title: String(row.title),
    status: String(row.status) as WorkflowRuntimeDashboardTask["status"],
    workflowRole: String(row.workflow_role),
    assigneeGroup: String(row.assignee_group),
    createdAt: String(row.created_at),
    ...(optionalString(row.deadline_at) ? { deadlineAt: optionalString(row.deadline_at)! } : {}),
    ageMinutes: Number(row.age_minutes),
    ...(Number.isFinite(overdueMinutes) && overdueMinutes > 0 ? { overdueMinutes } : {}),
  };
}

function mapDeadLetter(row: Record<string, unknown>): WorkflowRuntimeDashboardDeadLetter {
  return {
    ...mapLabels(row),
    messageId: String(row.message_id),
    instanceId: String(row.workflow_instance_id),
    kind: String(row.kind) as WorkflowRuntimeDashboardDeadLetter["kind"],
    target: String(row.target),
    attempt: Number(row.attempt),
    maxAttempts: Number(row.max_attempts),
    ...(optionalString(row.dead_letter_at) ? { deadLetterAt: optionalString(row.dead_letter_at)! } : {}),
    ...(optionalString(row.last_error) ? { lastError: optionalString(row.last_error)! } : {}),
  };
}

function mapAdapterError(row: Record<string, unknown>): WorkflowRuntimeDashboardAdapterError {
  const applyResult = row.apply_result && typeof row.apply_result === "object" ? row.apply_result as Record<string, unknown> : undefined;
  const dryRunResult = row.dry_run_result && typeof row.dry_run_result === "object" ? row.dry_run_result as Record<string, unknown> : undefined;
  return {
    ...mapLabels(row),
    intentId: String(row.intent_id),
    instanceId: String(row.workflow_instance_id),
    adapterId: String(row.adapter_id),
    resourceId: String(row.resource_id),
    operation: String(row.operation) as WorkflowRuntimeDashboardAdapterError["operation"],
    status: String(row.status) as WorkflowRuntimeDashboardAdapterError["status"],
    ...(jsonField(applyResult, "errorCode") ?? jsonField(dryRunResult, "errorCode") ? { errorCode: jsonField(applyResult, "errorCode") ?? jsonField(dryRunResult, "errorCode") } : {}),
    ...(jsonField(applyResult, "message") ?? jsonField(dryRunResult, "message") ? { errorMessage: jsonField(applyResult, "message") ?? jsonField(dryRunResult, "message") } : {}),
    updatedAt: String(row.updated_at),
  };
}

function mapCatalogChangeMetric(row: Record<string, unknown>): WorkflowRuntimeDashboardCatalogChangeMetric {
  return Object.freeze({
    resourceId: String(row.resource_id),
    operation: String(row.operation) as WorkflowRuntimeDashboardCatalogChangeMetric["operation"],
    status: String(row.status),
    count: Number(row.count),
  });
}

function payloadString(row: Record<string, unknown>, key: string): string | undefined {
  const payload = row.payload && typeof row.payload === "object" ? row.payload as Record<string, unknown> : undefined;
  const values = payload?.values && typeof payload.values === "object" ? payload.values as Record<string, unknown> : undefined;
  return values ? optionalString(values[key]) : undefined;
}

function mapCatalogChange(row: Record<string, unknown>): WorkflowRuntimeDashboardCatalogChange {
  const primaryAccountId =
    payloadString(row, "primary_account_id")
    ?? payloadString(row, "target_primary_account_id")
    ?? payloadString(row, "source_record_id");
  const serviceCode =
    payloadString(row, "asset_class_code")
    ?? payloadString(row, "sub_asset_class_code")
    ?? payloadString(row, "benchmark_code");
  return Object.freeze({
    ...mapLabels(row),
    intentId: String(row.intent_id),
    instanceId: String(row.workflow_instance_id),
    resourceId: String(row.resource_id),
    operation: String(row.operation) as WorkflowRuntimeDashboardCatalogChange["operation"],
    status: String(row.status),
    ...(primaryAccountId ? { targetPrimaryAccountId: primaryAccountId } : {}),
    ...(serviceCode ? { serviceCode } : {}),
    updatedAt: String(row.updated_at),
  });
}

export class PostgresWorkflowRuntimeDashboardReader implements WorkflowRuntimeDashboardReader {
  constructor(private readonly sql: SqlExecutor) {}

  async countInstances(): Promise<WorkflowRuntimeDashboardStatusCounts> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT
        CASE
          WHEN status IN ('pending','running') THEN 'active'
          WHEN status = 'waiting' THEN 'waiting'
          WHEN status = 'needs_intervention' THEN 'blocked'
          WHEN status = 'failed' THEN 'failed'
        END AS bucket,
        count(*)::int AS count
      FROM workflow_instance
      WHERE status IN ('pending','running','waiting','needs_intervention','failed')
      GROUP BY bucket
    `;
    return countRows(rows);
  }

  async countNodes(): Promise<WorkflowRuntimeDashboardStatusCounts> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT
        CASE
          WHEN status IN ('ready','running') THEN 'active'
          WHEN status = 'waiting' THEN 'waiting'
          WHEN status = 'needs_intervention' THEN 'blocked'
          WHEN status = 'failed' THEN 'failed'
        END AS bucket,
        count(*)::int AS count
      FROM workflow_node_instance
      WHERE status IN ('ready','running','waiting','needs_intervention','failed')
      GROUP BY bucket
    `;
    return countRows(rows);
  }

  async listOldestTasks(now: string): Promise<readonly WorkflowRuntimeDashboardTask[]> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT
        wt.id AS task_id,
        wt.workflow_instance_id,
        wt.workflow_version_id,
        wt.title,
        wt.status,
        wt.assignee_group,
        wt.created_at,
        wt.deadline_at,
        wrb.workflow_role,
        wd.name AS workflow_name,
        wv.version_number,
        wn.node_key,
        wn.block_type,
        floor(extract(epoch from (${now}::timestamptz - wt.created_at)) / 60)::int AS age_minutes,
        CASE WHEN wt.deadline_at IS NULL THEN NULL ELSE floor(extract(epoch from (${now}::timestamptz - wt.deadline_at)) / 60)::int END AS overdue_minutes
      FROM workflow_task wt
      JOIN workflow_role_binding wrb ON wrb.id = wt.workflow_role_binding_id
      JOIN workflow_instance wi ON wi.id = wt.workflow_instance_id
      JOIN workflow_version wv ON wv.id = wt.workflow_version_id
      JOIN workflow_definition wd ON wd.id = wv.workflow_definition_id
      JOIN workflow_node_instance ni ON ni.id = wt.workflow_node_instance_id
      JOIN workflow_node wn ON wn.id = ni.workflow_node_id
      WHERE wt.status IN ('open','claimed')
      ORDER BY wt.created_at ASC, wt.id ASC
      LIMIT 10
    `;
    return rows.map(mapTask);
  }

  async listOverdueTasks(now: string): Promise<readonly WorkflowRuntimeDashboardTask[]> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT
        wt.id AS task_id,
        wt.workflow_instance_id,
        wt.workflow_version_id,
        wt.title,
        wt.status,
        wt.assignee_group,
        wt.created_at,
        wt.deadline_at,
        wrb.workflow_role,
        wd.name AS workflow_name,
        wv.version_number,
        wn.node_key,
        wn.block_type,
        floor(extract(epoch from (${now}::timestamptz - wt.created_at)) / 60)::int AS age_minutes,
        floor(extract(epoch from (${now}::timestamptz - wt.deadline_at)) / 60)::int AS overdue_minutes
      FROM workflow_task wt
      JOIN workflow_role_binding wrb ON wrb.id = wt.workflow_role_binding_id
      JOIN workflow_instance wi ON wi.id = wt.workflow_instance_id
      JOIN workflow_version wv ON wv.id = wt.workflow_version_id
      JOIN workflow_definition wd ON wd.id = wv.workflow_definition_id
      JOIN workflow_node_instance ni ON ni.id = wt.workflow_node_instance_id
      JOIN workflow_node wn ON wn.id = ni.workflow_node_id
      WHERE wt.status IN ('open','claimed') AND wt.deadline_at <= ${now}::timestamptz
      ORDER BY wt.deadline_at ASC, wt.id ASC
      LIMIT 25
    `;
    return rows.map(mapTask);
  }

  async listDeadLetters(): Promise<readonly WorkflowRuntimeDashboardDeadLetter[]> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT
        wo.id AS message_id,
        wo.workflow_instance_id,
        wi.workflow_version_id,
        wo.kind,
        wo.target,
        wo.attempt,
        wo.max_attempts,
        wo.dead_letter_at,
        wo.last_error,
        wd.name AS workflow_name,
        wv.version_number,
        wn.node_key,
        wn.block_type
      FROM workflow_outbox wo
      JOIN workflow_instance wi ON wi.id = wo.workflow_instance_id
      JOIN workflow_version wv ON wv.id = wi.workflow_version_id
      JOIN workflow_definition wd ON wd.id = wv.workflow_definition_id
      LEFT JOIN workflow_node_instance ni ON ni.id = wo.workflow_node_instance_id
      LEFT JOIN workflow_node wn ON wn.id = ni.workflow_node_id
      WHERE wo.status = 'dead_letter'
      ORDER BY wo.dead_letter_at DESC NULLS LAST, wo.updated_at DESC, wo.id
      LIMIT 25
    `;
    return rows.map(mapDeadLetter);
  }

  async listAdapterErrors(): Promise<readonly WorkflowRuntimeDashboardAdapterError[]> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT
        wci.id AS intent_id,
        wci.workflow_instance_id,
        wi.workflow_version_id,
        wci.adapter_id,
        wci.resource_id,
        wci.operation,
        wci.status,
        wci.dry_run_result,
        wci.apply_result,
        wci.updated_at,
        wd.name AS workflow_name,
        wv.version_number,
        wn.node_key,
        wn.block_type
      FROM workflow_change_intent wci
      JOIN workflow_instance wi ON wi.id = wci.workflow_instance_id
      JOIN workflow_version wv ON wv.id = wi.workflow_version_id
      JOIN workflow_definition wd ON wd.id = wv.workflow_definition_id
      JOIN workflow_node_instance ni ON ni.id = wci.workflow_node_instance_id
      JOIN workflow_node wn ON wn.id = ni.workflow_node_id
      WHERE wci.status IN ('conflicted','failed')
      ORDER BY wci.updated_at DESC, wci.id
      LIMIT 25
    `;
    return rows.map(mapAdapterError);
  }

  async listCatalogChangeMetrics(): Promise<readonly WorkflowRuntimeDashboardCatalogChangeMetric[]> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT
        resource_id,
        operation,
        status,
        count(*)::int AS count
      FROM workflow_change_intent
      WHERE resource_id IN ('portfolio_configuration','asset_class','sub_asset_class','benchmark')
      GROUP BY resource_id, operation, status
      ORDER BY resource_id ASC, operation ASC, status ASC
    `;
    return rows.map(mapCatalogChangeMetric);
  }

  async listRecentCatalogChanges(): Promise<readonly WorkflowRuntimeDashboardCatalogChange[]> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT
        wci.id AS intent_id,
        wci.workflow_instance_id,
        wi.workflow_version_id,
        wci.resource_id,
        wci.operation,
        wci.status,
        wci.payload,
        wci.updated_at,
        wd.name AS workflow_name,
        wv.version_number,
        wn.node_key,
        wn.block_type
      FROM workflow_change_intent wci
      JOIN workflow_instance wi ON wi.id = wci.workflow_instance_id
      JOIN workflow_version wv ON wv.id = wi.workflow_version_id
      JOIN workflow_definition wd ON wd.id = wv.workflow_definition_id
      JOIN workflow_node_instance ni ON ni.id = wci.workflow_node_instance_id
      JOIN workflow_node wn ON wn.id = ni.workflow_node_id
      WHERE wci.resource_id IN ('portfolio_configuration','asset_class','sub_asset_class','benchmark')
      ORDER BY wci.updated_at DESC, wci.id
      LIMIT 25
    `;
    return rows.map(mapCatalogChange);
  }
}
