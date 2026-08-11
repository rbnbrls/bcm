import type { IdentityContext } from "@/lib/identity/types";
import { authorizeWorkflowAction, type WorkflowDataScope } from "@/lib/workflow-studio-authorization";
import type { SqlExecutor } from "@/lib/workflow-studio/definition-repository";

export type WorkflowRuntimeAnalyticsFilters = Readonly<{
  scope: WorkflowDataScope;
  from: string;
  to: string;
  workflowVersionIds?: readonly string[];
}>;

export type WorkflowRuntimeAnalyticsLabel = Readonly<{
  workflowName: string;
  workflowVersionId: string;
  versionNumber: number;
}>;

export type WorkflowRuntimeWorkflowMetric = WorkflowRuntimeAnalyticsLabel & Readonly<{
  volume: number;
  completed: number;
  cancelled: number;
  failed: number;
  averageLeadTimeMinutes: number;
  failureRate: number;
}>;

export type WorkflowRuntimeNodeMetric = WorkflowRuntimeAnalyticsLabel & Readonly<{
  nodeKey: string;
  blockType: string;
  executions: number;
  succeeded: number;
  skipped: number;
  failed: number;
  reworkCount: number;
  averageDurationMinutes: number;
  failureRate: number;
}>;

export type WorkflowRuntimeRoleMetric = WorkflowRuntimeAnalyticsLabel & Readonly<{
  workflowRole: string;
  taskCount: number;
  completed: number;
  rejected: number;
  slaOverdue: number;
  averageWaitMinutes: number;
  averageCompletionMinutes: number;
}>;

export type WorkflowRuntimeAnalyticsSummary = Readonly<{
  volume: number;
  completed: number;
  failed: number;
  failureRate: number;
  reworkCount: number;
  rejected: number;
  rejectionRate: number;
  slaOverdue: number;
}>;

export type WorkflowRuntimeAnalyticsModel = Readonly<{
  generatedAt: string;
  filters: WorkflowRuntimeAnalyticsFilters;
  summary: WorkflowRuntimeAnalyticsSummary;
  workflows: readonly WorkflowRuntimeWorkflowMetric[];
  nodes: readonly WorkflowRuntimeNodeMetric[];
  roles: readonly WorkflowRuntimeRoleMetric[];
}>;

export type WorkflowRuntimeAnalyticsServiceResult =
  | { ok: true; value: WorkflowRuntimeAnalyticsModel }
  | { ok: false; code: "permission_denied" | "scope_denied" | "invalid_filter"; message: string };

export interface WorkflowRuntimeAnalyticsReader {
  listWorkflowMetrics(filters: WorkflowRuntimeAnalyticsFilters): Promise<readonly WorkflowRuntimeWorkflowMetric[]>;
  listNodeMetrics(filters: WorkflowRuntimeAnalyticsFilters): Promise<readonly WorkflowRuntimeNodeMetric[]>;
  listRoleMetrics(filters: WorkflowRuntimeAnalyticsFilters, now: string): Promise<readonly WorkflowRuntimeRoleMetric[]>;
}

export class WorkflowRuntimeAnalyticsService {
  constructor(private readonly reader: WorkflowRuntimeAnalyticsReader) {}

  async load(
    identity: IdentityContext,
    input: Readonly<{ filters: WorkflowRuntimeAnalyticsFilters; now: string }>,
  ): Promise<WorkflowRuntimeAnalyticsServiceResult> {
    const validation = validateFilters(input.filters);
    if (validation) return validation;
    const authorization = authorizeWorkflowAction(identity, "workflow:view", input.filters.scope);
    if (!authorization.authorized) {
      return {
        ok: false,
        code: authorization.code === "permission_denied" ? "permission_denied" : "scope_denied",
        message: authorization.message,
      };
    }

    const [workflows, nodes, roles] = await Promise.all([
      this.reader.listWorkflowMetrics(input.filters),
      this.reader.listNodeMetrics(input.filters),
      this.reader.listRoleMetrics(input.filters, input.now),
    ]);

    return {
      ok: true,
      value: Object.freeze({
        generatedAt: input.now,
        filters: freezeFilters(input.filters),
        summary: summarize(workflows, nodes, roles),
        workflows,
        nodes,
        roles,
      }),
    };
  }
}

function validateFilters(filters: WorkflowRuntimeAnalyticsFilters): WorkflowRuntimeAnalyticsServiceResult | null {
  const from = Date.parse(filters.from);
  const to = Date.parse(filters.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
    return { ok: false, code: "invalid_filter", message: "Procesanalytics vereist een geldige periode met from vóór to." };
  }
  if (filters.workflowVersionIds?.length === 0) {
    return { ok: false, code: "invalid_filter", message: "Gebruik geen lege workflowVersionIds-filter." };
  }
  return null;
}

function freezeFilters(filters: WorkflowRuntimeAnalyticsFilters): WorkflowRuntimeAnalyticsFilters {
  return Object.freeze({
    scope: Object.freeze({
      tenant: filters.scope.tenant,
      businessUnit: filters.scope.businessUnit,
      ...(filters.scope.clientIds ? { clientIds: Object.freeze([...filters.scope.clientIds]) } : {}),
    }),
    from: filters.from,
    to: filters.to,
    ...(filters.workflowVersionIds ? { workflowVersionIds: Object.freeze([...filters.workflowVersionIds]) } : {}),
  });
}

function summarize(
  workflows: readonly WorkflowRuntimeWorkflowMetric[],
  nodes: readonly WorkflowRuntimeNodeMetric[],
  roles: readonly WorkflowRuntimeRoleMetric[],
): WorkflowRuntimeAnalyticsSummary {
  const volume = workflows.reduce((sum, row) => sum + row.volume, 0);
  const completed = workflows.reduce((sum, row) => sum + row.completed, 0);
  const failed = workflows.reduce((sum, row) => sum + row.failed, 0);
  const reworkCount = nodes.reduce((sum, row) => sum + row.reworkCount, 0);
  const rejected = roles.reduce((sum, row) => sum + row.rejected, 0);
  const taskCount = roles.reduce((sum, row) => sum + row.taskCount, 0);
  const slaOverdue = roles.reduce((sum, row) => sum + row.slaOverdue, 0);
  return Object.freeze({
    volume,
    completed,
    failed,
    failureRate: ratio(failed, volume),
    reworkCount,
    rejected,
    rejectionRate: ratio(rejected, taskCount),
    slaOverdue,
  });
}

function ratio(part: number, total: number): number {
  return total > 0 ? Number((part / total).toFixed(4)) : 0;
}

function numberField(row: Record<string, unknown>, key: string): number {
  const value = Number(row[key]);
  return Number.isFinite(value) ? value : 0;
}

function mapWorkflowMetric(row: Record<string, unknown>): WorkflowRuntimeWorkflowMetric {
  const volume = numberField(row, "volume");
  const failed = numberField(row, "failed");
  return Object.freeze({
    workflowName: String(row.workflow_name),
    workflowVersionId: String(row.workflow_version_id),
    versionNumber: numberField(row, "version_number"),
    volume,
    completed: numberField(row, "completed"),
    cancelled: numberField(row, "cancelled"),
    failed,
    averageLeadTimeMinutes: numberField(row, "average_lead_time_minutes"),
    failureRate: ratio(failed, volume),
  });
}

function mapNodeMetric(row: Record<string, unknown>): WorkflowRuntimeNodeMetric {
  const executions = numberField(row, "executions");
  const failed = numberField(row, "failed");
  return Object.freeze({
    workflowName: String(row.workflow_name),
    workflowVersionId: String(row.workflow_version_id),
    versionNumber: numberField(row, "version_number"),
    nodeKey: String(row.node_key),
    blockType: String(row.block_type),
    executions,
    succeeded: numberField(row, "succeeded"),
    skipped: numberField(row, "skipped"),
    failed,
    reworkCount: numberField(row, "rework_count"),
    averageDurationMinutes: numberField(row, "average_duration_minutes"),
    failureRate: ratio(failed, executions),
  });
}

function mapRoleMetric(row: Record<string, unknown>): WorkflowRuntimeRoleMetric {
  return Object.freeze({
    workflowName: String(row.workflow_name),
    workflowVersionId: String(row.workflow_version_id),
    versionNumber: numberField(row, "version_number"),
    workflowRole: String(row.workflow_role),
    taskCount: numberField(row, "task_count"),
    completed: numberField(row, "completed"),
    rejected: numberField(row, "rejected"),
    slaOverdue: numberField(row, "sla_overdue"),
    averageWaitMinutes: numberField(row, "average_wait_minutes"),
    averageCompletionMinutes: numberField(row, "average_completion_minutes"),
  });
}

export class PostgresWorkflowRuntimeAnalyticsReader implements WorkflowRuntimeAnalyticsReader {
  constructor(private readonly sql: SqlExecutor) {}

  async listWorkflowMetrics(filters: WorkflowRuntimeAnalyticsFilters): Promise<readonly WorkflowRuntimeWorkflowMetric[]> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT
        wd.name AS workflow_name,
        wi.workflow_version_id,
        wv.version_number,
        count(*)::int AS volume,
        count(*) FILTER (WHERE wi.status = 'completed')::int AS completed,
        count(*) FILTER (WHERE wi.status = 'cancelled')::int AS cancelled,
        count(*) FILTER (WHERE wi.status = 'failed')::int AS failed,
        coalesce(round(avg(extract(epoch from (wi.completed_at - wi.started_at)) / 60)
          FILTER (WHERE wi.started_at IS NOT NULL AND wi.completed_at IS NOT NULL))::int, 0) AS average_lead_time_minutes
      FROM workflow_instance wi
      JOIN workflow_version wv ON wv.id = wi.workflow_version_id
      JOIN workflow_definition wd ON wd.id = wv.workflow_definition_id
      WHERE ${this.scopePredicate(filters)}
        AND wi.created_at >= ${filters.from}::timestamptz
        AND wi.created_at < ${filters.to}::timestamptz
        ${this.versionPredicate("wi", filters)}
      GROUP BY wd.name, wi.workflow_version_id, wv.version_number
      ORDER BY wd.name ASC, wv.version_number ASC
    `;
    return rows.map(mapWorkflowMetric);
  }

  async listNodeMetrics(filters: WorkflowRuntimeAnalyticsFilters): Promise<readonly WorkflowRuntimeNodeMetric[]> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT
        wd.name AS workflow_name,
        ni.workflow_version_id,
        wv.version_number,
        wn.node_key,
        wn.block_type,
        count(*)::int AS executions,
        count(*) FILTER (WHERE ni.status = 'succeeded')::int AS succeeded,
        count(*) FILTER (WHERE ni.status = 'skipped')::int AS skipped,
        count(*) FILTER (WHERE ni.status = 'failed')::int AS failed,
        count(*) FILTER (WHERE ni.attempt > 1)::int AS rework_count,
        coalesce(round(avg(extract(epoch from (ni.completed_at - ni.started_at)) / 60)
          FILTER (WHERE ni.started_at IS NOT NULL AND ni.completed_at IS NOT NULL))::int, 0) AS average_duration_minutes
      FROM workflow_node_instance ni
      JOIN workflow_instance wi ON wi.id = ni.workflow_instance_id
      JOIN workflow_version wv ON wv.id = ni.workflow_version_id
      JOIN workflow_definition wd ON wd.id = wv.workflow_definition_id
      JOIN workflow_node wn ON wn.id = ni.workflow_node_id
      WHERE ${this.scopePredicate(filters)}
        AND ni.created_at >= ${filters.from}::timestamptz
        AND ni.created_at < ${filters.to}::timestamptz
        ${this.versionPredicate("ni", filters)}
      GROUP BY wd.name, ni.workflow_version_id, wv.version_number, wn.node_key, wn.block_type
      ORDER BY wd.name ASC, wv.version_number ASC, wn.node_key ASC
    `;
    return rows.map(mapNodeMetric);
  }

  async listRoleMetrics(filters: WorkflowRuntimeAnalyticsFilters, now: string): Promise<readonly WorkflowRuntimeRoleMetric[]> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT
        wd.name AS workflow_name,
        wt.workflow_version_id,
        wv.version_number,
        wrb.workflow_role,
        count(*)::int AS task_count,
        count(*) FILTER (WHERE wt.status = 'completed')::int AS completed,
        count(*) FILTER (WHERE wt.outcome IN ('rejected','returned'))::int AS rejected,
        count(*) FILTER (
          WHERE wt.deadline_at IS NOT NULL
            AND coalesce(wt.completed_at, ${now}::timestamptz) > wt.deadline_at
        )::int AS sla_overdue,
        coalesce(round(avg(extract(epoch from (wt.claimed_at - wt.created_at)) / 60)
          FILTER (WHERE wt.claimed_at IS NOT NULL))::int, 0) AS average_wait_minutes,
        coalesce(round(avg(extract(epoch from (wt.completed_at - wt.created_at)) / 60)
          FILTER (WHERE wt.completed_at IS NOT NULL))::int, 0) AS average_completion_minutes
      FROM workflow_task wt
      JOIN workflow_instance wi ON wi.id = wt.workflow_instance_id
      JOIN workflow_version wv ON wv.id = wt.workflow_version_id
      JOIN workflow_definition wd ON wd.id = wv.workflow_definition_id
      JOIN workflow_role_binding wrb ON wrb.id = wt.workflow_role_binding_id
      WHERE ${this.scopePredicate(filters)}
        AND wt.created_at >= ${filters.from}::timestamptz
        AND wt.created_at < ${filters.to}::timestamptz
        ${this.versionPredicate("wt", filters)}
      GROUP BY wd.name, wt.workflow_version_id, wv.version_number, wrb.workflow_role
      ORDER BY wd.name ASC, wv.version_number ASC, wrb.workflow_role ASC
    `;
    return rows.map(mapRoleMetric);
  }

  private scopePredicate(filters: WorkflowRuntimeAnalyticsFilters) {
    const clientIds = filters.scope.clientIds;
    return this.sql`
      wi.tenant = ${filters.scope.tenant}
      AND wi.business_unit = ${filters.scope.businessUnit}
      ${clientIds
        ? this.sql`AND wi.client_ids IS NOT NULL AND wi.client_ids <@ ${this.sql.array([...clientIds])}::text[]`
        : this.sql``}
    `;
  }

  private versionPredicate(alias: "wi" | "ni" | "wt", filters: WorkflowRuntimeAnalyticsFilters) {
    if (!filters.workflowVersionIds?.length) return this.sql``;
    const column = this.sql.unsafe(`${alias}.workflow_version_id`);
    return this.sql`AND ${column} = ANY(${this.sql.array([...filters.workflowVersionIds])}::uuid[])`;
  }
}
