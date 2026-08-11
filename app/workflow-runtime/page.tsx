import Link from "next/link";
import { redirect } from "next/navigation";

import { sql } from "@/lib/db";
import { getFeatureFlagSnapshot } from "@/lib/feature-flags";
import { getIdentityContext } from "@/lib/identity/request";
import { authorizeWorkflowPermission, getIdentityClientScope } from "@/lib/workflow-studio-authorization";
import {
  PostgresWorkflowRuntimeAnalyticsReader,
  PostgresWorkflowRuntimeDashboardReader,
  WorkflowRuntimeAnalyticsService,
  WorkflowRuntimeDashboardService,
  type WorkflowRuntimeAnalyticsModel,
  type WorkflowRuntimeNodeMetric,
  type WorkflowRuntimeRoleMetric,
  type WorkflowRuntimeWorkflowMetric,
  type WorkflowRuntimeDashboardAlert,
  type WorkflowRuntimeDashboardDeadLetter,
  type WorkflowRuntimeDashboardModel,
  type WorkflowRuntimeDashboardTask,
} from "@/lib/workflow-studio";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ from?: string; to?: string; versionId?: string; clientId?: string }>;
};

function formatDate(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function isoDateInput(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function formatRate(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

function formatDuration(minutes?: number): string {
  if (minutes === undefined || !Number.isFinite(minutes)) return "-";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  return days > 0 ? `${days} d ${hours % 24} u` : `${hours} u ${minutes % 60} min`;
}

function statusClass(status: string): string {
  return `studio-status studio-status--${status}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="workflow-runtime-panel">
    <h2>{title}</h2>
    {children}
  </section>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="workflow-runtime-empty">{children}</p>;
}

function CountTiles({ model }: { model: WorkflowRuntimeDashboardModel }) {
  const tiles = [
    { label: "Instance actief", value: model.instanceCounts.active },
    { label: "Instance wachtend", value: model.instanceCounts.waiting },
    { label: "Instance geblokkeerd", value: model.instanceCounts.blocked },
    { label: "Instance mislukt", value: model.instanceCounts.failed },
    { label: "Nodes actief", value: model.nodeCounts.active },
    { label: "Nodes wachtend", value: model.nodeCounts.waiting },
    { label: "Nodes geblokkeerd", value: model.nodeCounts.blocked },
    { label: "Nodes mislukt", value: model.nodeCounts.failed },
  ];
  return <dl className="runtime-metric-grid">
    {tiles.map((tile) => <div key={tile.label}>
      <dt>{tile.label}</dt>
      <dd>{tile.value}</dd>
    </div>)}
  </dl>;
}

function AnalyticsTiles({ model }: { model: WorkflowRuntimeAnalyticsModel }) {
  const tiles = [
    { label: "Volume", value: model.summary.volume },
    { label: "Afgerond", value: model.summary.completed },
    { label: "Failure rate", value: formatRate(model.summary.failureRate) },
    { label: "Rework", value: model.summary.reworkCount },
    { label: "Rejecties", value: model.summary.rejected },
    { label: "Rejectieratio", value: formatRate(model.summary.rejectionRate) },
    { label: "SLA overschreden", value: model.summary.slaOverdue },
  ];
  return <dl className="runtime-metric-grid">
    {tiles.map((tile) => <div key={tile.label}>
      <dt>{tile.label}</dt>
      <dd>{tile.value}</dd>
    </div>)}
  </dl>;
}

function AnalyticsFilters({ model, selectedClientId }: { model: WorkflowRuntimeAnalyticsModel; selectedClientId?: string }) {
  return <form className="workflow-runtime-filterbar">
    <label>Van<input type="date" name="from" defaultValue={isoDateInput(model.filters.from)} /></label>
    <label>Tot<input type="date" name="to" defaultValue={isoDateInput(model.filters.to)} /></label>
    <label>Versie<input type="text" name="versionId" defaultValue={model.filters.workflowVersionIds?.[0] ?? ""} placeholder="workflow_version_id" /></label>
    <label>Client<input type="text" name="clientId" defaultValue={selectedClientId ?? ""} placeholder="optioneel" /></label>
    <button className="button button-secondary" type="submit">Filter</button>
  </form>;
}

function WorkflowAnalyticsTable({ rows }: { rows: readonly WorkflowRuntimeWorkflowMetric[] }) {
  if (rows.length === 0) return <Empty>Geen workflowmetrics in deze periode.</Empty>;
  return <div className="runtime-table-wrap">
    <table className="runtime-table">
      <thead><tr><th>Workflow</th><th>Volume</th><th>Afgerond</th><th>Mislukt</th><th>Failure rate</th><th>Gem. doorlooptijd</th></tr></thead>
      <tbody>
        {rows.map((row) => <tr key={row.workflowVersionId}>
          <td>{row.workflowName} v{row.versionNumber}<br /><small>{shortId(row.workflowVersionId)}</small></td>
          <td>{row.volume}</td>
          <td>{row.completed}</td>
          <td>{row.failed}</td>
          <td>{formatRate(row.failureRate)}</td>
          <td>{formatDuration(row.averageLeadTimeMinutes)}</td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}

function NodeAnalyticsTable({ rows }: { rows: readonly WorkflowRuntimeNodeMetric[] }) {
  if (rows.length === 0) return <Empty>Geen nodemetrics in deze periode.</Empty>;
  return <div className="runtime-table-wrap">
    <table className="runtime-table">
      <thead><tr><th>Node</th><th>Workflow</th><th>Executies</th><th>Mislukt</th><th>Rework</th><th>Gem. duur</th></tr></thead>
      <tbody>
        {rows.map((row) => <tr key={`${row.workflowVersionId}-${row.nodeKey}`}>
          <td>{row.nodeKey}<br /><small>{row.blockType}</small></td>
          <td>{row.workflowName} v{row.versionNumber}</td>
          <td>{row.executions}</td>
          <td>{row.failed} · {formatRate(row.failureRate)}</td>
          <td>{row.reworkCount}</td>
          <td>{formatDuration(row.averageDurationMinutes)}</td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}

function RoleAnalyticsTable({ rows }: { rows: readonly WorkflowRuntimeRoleMetric[] }) {
  if (rows.length === 0) return <Empty>Geen rolmetrics in deze periode.</Empty>;
  return <div className="runtime-table-wrap">
    <table className="runtime-table">
      <thead><tr><th>Rol</th><th>Workflow</th><th>Taken</th><th>Rejecties</th><th>SLA</th><th>Wachttijd</th><th>Doorlooptijd</th></tr></thead>
      <tbody>
        {rows.map((row) => <tr key={`${row.workflowVersionId}-${row.workflowRole}`}>
          <td>{row.workflowRole}</td>
          <td>{row.workflowName} v{row.versionNumber}</td>
          <td>{row.taskCount}</td>
          <td>{row.rejected}</td>
          <td>{row.slaOverdue}</td>
          <td>{formatDuration(row.averageWaitMinutes)}</td>
          <td>{formatDuration(row.averageCompletionMinutes)}</td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}

function TaskTable({ tasks, overdue }: { tasks: readonly WorkflowRuntimeDashboardTask[]; overdue?: boolean }) {
  if (tasks.length === 0) return <Empty>Geen taken.</Empty>;
  return <div className="runtime-table-wrap">
    <table className="runtime-table">
      <thead><tr><th>Workflow</th><th>Node</th><th>Taak</th><th>Status</th><th>Rol</th><th>{overdue ? "Over tijd" : "Leeftijd"}</th><th>Deadline</th></tr></thead>
      <tbody>
        {tasks.map((task) => <tr key={task.taskId}>
          <td><Link href={`/workflow-runtime/${task.instanceId}`}>{task.workflowName} v{task.versionNumber}</Link><br /><small>{shortId(task.workflowVersionId)}</small></td>
          <td>{task.nodeKey ?? "-"}<br /><small>{task.blockType ?? "-"}</small></td>
          <td>{task.title}</td>
          <td><span className={statusClass(task.status)}>{task.status}</span></td>
          <td>{task.workflowRole}<br /><small>{task.assigneeGroup}</small></td>
          <td>{formatDuration(overdue ? task.overdueMinutes : task.ageMinutes)}</td>
          <td>{formatDate(task.deadlineAt)}</td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}

function DeadLetterTable({ messages }: { messages: readonly WorkflowRuntimeDashboardDeadLetter[] }) {
  if (messages.length === 0) return <Empty>Geen dead letters.</Empty>;
  return <div className="runtime-table-wrap">
    <table className="runtime-table">
      <thead><tr><th>Workflow</th><th>Node</th><th>Delivery</th><th>Attempt</th><th>Dead letter</th><th>Laatste fout</th></tr></thead>
      <tbody>
        {messages.map((message) => <tr key={message.messageId}>
          <td><Link href={`/workflow-runtime/${message.instanceId}`}>{message.workflowName} v{message.versionNumber}</Link><br /><small>{shortId(message.workflowVersionId)}</small></td>
          <td>{message.nodeKey ?? "-"}<br /><small>{message.blockType ?? "-"}</small></td>
          <td>{message.kind}<br /><small>{message.target}</small></td>
          <td>{message.attempt}/{message.maxAttempts}</td>
          <td>{formatDate(message.deadLetterAt)}</td>
          <td>{message.lastError ?? "-"}</td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}

function AlertList({ alerts }: { alerts: readonly WorkflowRuntimeDashboardAlert[] }) {
  if (alerts.length === 0) return <Empty>Geen runtime-alerts.</Empty>;
  return <ul className="runtime-alert-list">
    {alerts.map((alert, index) => <li key={`${alert.kind}-${alert.subjectId ?? index}`} className={`runtime-alert runtime-alert--${alert.severity}`}>
      <strong>{alert.workflowName}{alert.versionNumber > 0 ? ` v${alert.versionNumber}` : ""}</strong>
      <span>{alert.nodeKey ?? "runtime"} · {alert.kind}</span>
      <p>{alert.message}</p>
      {alert.instanceId ? <Link href={`/workflow-runtime/${alert.instanceId}`}>Open instance {shortId(alert.instanceId)}</Link> : null}
    </li>)}
  </ul>;
}

function defaultFrom(now: Date): string {
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 30);
  return from.toISOString();
}

function dateFilterValue(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

export default async function WorkflowRuntimeDashboardPage({ searchParams }: PageProps) {
  if (!getFeatureFlagSnapshot()["workflow_runtime.start"]) redirect("/change-catalog");
  if (!sql) redirect("/change-catalog?error=workflowdatabase-niet-beschikbaar");
  const query = await searchParams;
  const identity = await getIdentityContext();
  const permission = authorizeWorkflowPermission(identity, "workflow:view");
  if (!permission.authorized) redirect(`/change-catalog?error=${encodeURIComponent(permission.message)}`);
  if (!identity.tenant || !identity.businessUnit) redirect("/change-catalog?error=workflow-scope-ontbreekt");
  const now = new Date();
  const identityClients = getIdentityClientScope(identity);
  const selectedClientIds = query.clientId?.trim() ? [query.clientId.trim()] : identityClients ?? undefined;
  const analytics = await new WorkflowRuntimeAnalyticsService(new PostgresWorkflowRuntimeAnalyticsReader(sql)).load(identity, {
    now: now.toISOString(),
    filters: {
      scope: {
        tenant: identity.tenant,
        businessUnit: identity.businessUnit,
        ...(selectedClientIds ? { clientIds: selectedClientIds } : {}),
      },
      from: dateFilterValue(query.from, defaultFrom(now)),
      to: dateFilterValue(query.to, now.toISOString()),
      ...(query.versionId?.trim() ? { workflowVersionIds: [query.versionId.trim()] } : {}),
    },
  });
  if (!analytics.ok) redirect(`/change-catalog?error=${encodeURIComponent(analytics.message)}`);

  const model = await new WorkflowRuntimeDashboardService(new PostgresWorkflowRuntimeDashboardReader(sql)).load({
    now: now.toISOString(),
  });

  return <div className="page-shell workflow-runtime-dashboard-page">
    <header className="page-intro">
      <div>
        <p className="eyebrow">RUNTIME OPERATIONS</p>
        <h1>Workflow Runtime</h1>
        <p>Operationeel overzicht en procesanalytics voor actieve uitvoering, SLA-risico&apos;s, dead letters en adapterfouten.</p>
      </div>
      <div className="page-intro-actions">
        <Link className="button button-secondary" href="/tasks">Mijn Werk</Link>
        <Link className="button button-secondary" href="/workflow-studio">Workflow Studio</Link>
      </div>
    </header>

    <CountTiles model={model} />

    <Section title="Procesanalytics">
      <AnalyticsFilters model={analytics.value} selectedClientId={query.clientId?.trim() || undefined} />
      <AnalyticsTiles model={analytics.value} />
      <WorkflowAnalyticsTable rows={analytics.value.workflows} />
    </Section>

    <Section title="Nodedoorlooptijd en rework">
      <NodeAnalyticsTable rows={analytics.value.nodes} />
    </Section>

    <Section title="Rolwachttijd en SLA">
      <RoleAnalyticsTable rows={analytics.value.roles} />
    </Section>

    <Section title="Alerts">
      <AlertList alerts={model.alerts} />
    </Section>

    <Section title="Oudste open taken">
      <TaskTable tasks={model.oldestTasks} />
    </Section>

    <Section title="Verlopen SLA">
      <TaskTable tasks={model.overdueTasks} overdue />
    </Section>

    <Section title="Dead letters">
      <DeadLetterTable messages={model.deadLetters} />
    </Section>

    <Section title="Adapterfouten">
      {model.adapterErrors.length === 0 ? <Empty>Geen adapterfouten.</Empty> : <div className="runtime-table-wrap">
        <table className="runtime-table">
          <thead><tr><th>Workflow</th><th>Node</th><th>Intent</th><th>Status</th><th>Adapter</th><th>Laatste fout</th></tr></thead>
          <tbody>
            {model.adapterErrors.map((error) => <tr key={error.intentId}>
              <td><Link href={`/workflow-runtime/${error.instanceId}`}>{error.workflowName} v{error.versionNumber}</Link><br /><small>{shortId(error.workflowVersionId)}</small></td>
              <td>{error.nodeKey ?? "-"}<br /><small>{error.blockType ?? "-"}</small></td>
              <td>{error.operation} {error.resourceId}<br /><small>{shortId(error.intentId)}</small></td>
              <td><span className={statusClass(error.status)}>{error.status}</span></td>
              <td>{error.adapterId}</td>
              <td>{error.errorCode ?? error.errorMessage ?? "-"}</td>
            </tr>)}
          </tbody>
        </table>
      </div>}
    </Section>

    <p className="workflow-runtime-generated">Bijgewerkt: {formatDate(model.generatedAt)}</p>
  </div>;
}
