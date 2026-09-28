import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { retryWorkflowNodeAction } from "@/app/workflow-runtime/actions";
import { sql } from "@/lib/db";
import { getFeatureFlagSnapshot } from "@/lib/feature-flags";
import { getIdentityContext } from "@/lib/identity/request";
import { authorizeWorkflowPermission } from "@/lib/workflow-studio-authorization";
import {
  PostgresWorkflowRuntimeDetailReader,
  WorkflowRuntimeDetailService,
  type WorkflowRuntimeDetailModel,
} from "@/lib/workflow-studio";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ instanceId: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
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

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
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

function InstanceSummary({ model }: { model: WorkflowRuntimeDetailModel }) {
  return <dl className="workflow-runtime-summary">
    <div><dt>Status</dt><dd><span className={statusClass(model.instance.status)}>{model.instance.status}</span></dd></div>
    <div><dt>Versie</dt><dd>{shortId(model.instance.workflowVersionId)}</dd></div>
    <div><dt>Gestart door</dt><dd>{model.instance.startedByUserId}</dd></div>
    <div><dt>Gestart</dt><dd>{formatDate(model.instance.startedAt)}</dd></div>
    <div><dt>Actieve nodes</dt><dd>{model.activeNodes.length}</dd></div>
    <div><dt>Events</dt><dd>{model.events.length}</dd></div>
  </dl>;
}

export default async function WorkflowRuntimeInstancePage({ params, searchParams }: PageProps) {
  if (!getFeatureFlagSnapshot()["workflow_runtime.start"]) redirect("/change-catalog");
  if (!sql) redirect("/change-catalog?error=workflowdatabase-niet-beschikbaar");
  const [{ instanceId }, query] = await Promise.all([params, searchParams]);
  const identity = await getIdentityContext();
  const permission = authorizeWorkflowPermission(identity, "workflow:view");
  if (!permission.authorized) redirect(`/change-catalog?error=${encodeURIComponent(permission.message)}`);
  const model = await new WorkflowRuntimeDetailService(new PostgresWorkflowRuntimeDetailReader(sql)).load(instanceId);
  if (!model) notFound();

  return <div className="page-shell workflow-runtime-detail-page">
    <header className="page-intro">
      <div>
        <p className="eyebrow"><Link href="/workflow-runtime">RUNTIME</Link> · INSTANCE</p>
        <h1>Workflowinstance {shortId(model.instance.instanceId)}</h1>
        <p>Supportweergave met runtime-state, taken, snapshots, intents, outboxdelivery en audit-events.</p>
      </div>
      <div className="page-intro-actions">
        <Link className="button button-secondary" href="/workflow-runtime">Dashboard</Link>
        <Link className="button button-secondary" href="/tasks">Taken</Link>
      </div>
    </header>

    {query.notice ? <div className="approval-success" role="status">{query.notice}</div> : null}
    {query.error ? <div className="form-errors" role="alert">Actie niet uitgevoerd: {query.error}</div> : null}

    <InstanceSummary model={model} />

    <Section title="Actieve nodes">
      {model.activeNodes.length === 0 ? <Empty>Geen actieve nodes.</Empty> : <div className="runtime-grid">
        {model.activeNodes.map((node) => <article key={node.nodeInstanceId}>
          <strong>{node.nodeKey}</strong>
          <span className={statusClass(node.status)}>{node.status}</span>
          <dl><div><dt>Type</dt><dd>{node.blockType}</dd></div><div><dt>Attempt</dt><dd>{node.attempt}/{node.maxAttempts}</dd></div><div><dt>Beschikbaar</dt><dd>{formatDate(node.availableAt)}</dd></div></dl>
        </article>)}
      </div>}
    </Section>

    <Section title="Retryacties">
      {model.retryableNodes.length === 0 ? <Empty>Geen retrybare node-attempts.</Empty> : <div className="runtime-grid">
        {model.retryableNodes.map((node) => <article key={node.nodeInstanceId}>
          <strong>{node.nodeKey}</strong>
          <p>{node.errorMessage ?? node.errorCode ?? "Node wacht op handmatige retry."}</p>
          <form action={retryWorkflowNodeAction}>
            <input type="hidden" name="instanceId" value={model.instance.instanceId} />
            <input type="hidden" name="nodeInstanceId" value={node.nodeInstanceId} />
            <input type="hidden" name="expectedStatus" value={node.status} />
            <button className="button button-secondary" type="submit">Retry plannen</button>
          </form>
        </article>)}
      </div>}
    </Section>

    <Section title="Taken">
      {model.tasks.length === 0 ? <Empty>Geen taken.</Empty> : <div className="runtime-table-wrap"><table className="runtime-table"><thead><tr><th>Titel</th><th>Status</th><th>Rol</th><th>Claim</th><th>Deadline</th></tr></thead><tbody>
        {model.tasks.map((task) => <tr key={task.id}><td>{task.title}</td><td>{task.status}</td><td>{task.workflowRole}</td><td>{task.claimedByUserId ?? "-"}</td><td>{formatDate(task.deadlineAt)}</td></tr>)}
      </tbody></table></div>}
    </Section>

    <Section title="Snapshots">
      {model.snapshots.length === 0 ? <Empty>Geen snapshots.</Empty> : <div className="runtime-grid">
        {model.snapshots.map((snapshot) => <article key={snapshot.id}>
          <strong>{snapshot.resourceId}</strong>
          <dl><div><dt>Bron</dt><dd>{snapshot.sourceRecordId}</dd></div><div><dt>Token</dt><dd>{shortId(snapshot.concurrencyToken)}</dd></div><div><dt>Gelezen</dt><dd>{formatDate(snapshot.readAt)}</dd></div></dl>
          <pre>{json(snapshot.selectedFields)}</pre>
        </article>)}
      </div>}
    </Section>

    <Section title="Change intents">
      {model.changeIntents.length === 0 ? <Empty>Geen change intents.</Empty> : <div className="runtime-grid">
        {model.changeIntents.map((intent) => <article key={intent.id}>
          <strong>{intent.resourceId} · {intent.operation}</strong>
          <span className={statusClass(intent.status)}>{intent.status}</span>
          <dl><div><dt>Adapter</dt><dd>{intent.adapterId}</dd></div><div><dt>Apply</dt><dd>{intent.applyResult?.status ?? "-"}</dd></div><div><dt>Effectief</dt><dd>{formatDate(intent.effectiveAt)}</dd></div></dl>
          <pre>{json({ payload: intent.payload, dryRunResult: intent.dryRunResult, applyResult: intent.applyResult })}</pre>
        </article>)}
      </div>}
    </Section>

    <Section title="Beslissingen">
      {model.decisions.length === 0 ? <Empty>Geen beslissingen.</Empty> : <div className="runtime-grid">
        {model.decisions.map((decision) => <article key={decision.eventId ?? `${decision.eventType}-${decision.occurredAt}`}>
          <strong>{decision.eventType}</strong>
          <dl><div><dt>Tijd</dt><dd>{formatDate(decision.occurredAt)}</dd></div><div><dt>Node</dt><dd>{decision.nodeInstanceId ? shortId(decision.nodeInstanceId) : "-"}</dd></div></dl>
          <pre>{json(decision.payload)}</pre>
        </article>)}
      </div>}
    </Section>

    <Section title="Outbox delivery">
      {model.outbox.length === 0 ? <Empty>Geen outboxberichten.</Empty> : <div className="runtime-table-wrap"><table className="runtime-table"><thead><tr><th>Kind</th><th>Target</th><th>Status</th><th>Attempt</th><th>Beschikbaar</th><th>Fout</th></tr></thead><tbody>
        {model.outbox.map((message) => <tr key={message.id}><td>{message.kind}</td><td>{message.target}</td><td>{message.status}</td><td>{message.attempt}/{message.maxAttempts}</td><td>{formatDate(message.availableAt)}</td><td>{message.lastError ?? "-"}</td></tr>)}
      </tbody></table></div>}
    </Section>

    <Section title="Tijdlijn">
      {model.events.length === 0 ? <Empty>Geen audit-events.</Empty> : <ol className="runtime-timeline">
        {model.events.map((event) => <li key={event.id ?? event.idempotencyKey}>
          <div><strong>{event.sequenceNumber ?? "-"} · {event.eventType}</strong><span>{formatDate(event.occurredAt)} · {event.actor.type}:{event.actor.id}</span></div>
          <pre>{json(event.payload)}</pre>
        </li>)}
      </ol>}
    </Section>
  </div>;
}
