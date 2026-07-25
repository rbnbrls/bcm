import Link from "next/link";
import { notFound } from "next/navigation";
import { getChangeRequest } from "@/lib/db";
import { ExportButton } from "@/components/export-button";
import { ChangeStatusSection } from "./change-status-section";

const STATUS_ORDER = ["draft", "submitted", "accepted", "in_progress", "processed", "validated"] as const;
type Status = (typeof STATUS_ORDER)[number];

const STATUS_LABELS: Record<string, string> = {
  draft: "Concept",
  submitted: "Ingediend",
  accepted: "Geaccordeerd",
  in_progress: "In behandeling",
  processed: "Verwerkt",
  validated: "Gevalideerd",
};

const STATUS_COLORS: Record<string, { bg: string; dot: string; text: string }> = {
  draft: { bg: "#eef1ed", dot: "#5d6864", text: "#5d6864" },
  submitted: { bg: "#dff4e9", dot: "#0f6d55", text: "#0a513f" },
  accepted: { bg: "#e3eaf5", dot: "#28497c", text: "#1a3460" },
  in_progress: { bg: "#fff3d6", dot: "#c8950c", text: "#926d0a" },
  processed: { bg: "#e8f5e9", dot: "#2e7d32", text: "#1b5e20" },
  validated: { bg: "#dff4e9", dot: "#0a513f", text: "#0a513f" },
};

function SlaTimer({ createdAt, slaWeeks, status }: { createdAt: string; slaWeeks: number; status: string }) {
  const created = new Date(createdAt);
  const now = new Date();
  const daysRunning = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  const slaDays = slaWeeks * 7;
  const remaining = slaDays - daysRunning;
  const isDone = status === "validated" || status === "processed";

  if (isDone) {
    return (
      <div className="sla-indicator sla-ok">
        <span className="sla-icon">✓</span>
        <div>
          <strong>Afgerond</strong>
          <span>{daysRunning} dag{daysRunning !== 1 ? "en" : ""} (SLA: {slaDays}d)</span>
        </div>
      </div>
    );
  }

  const atRisk = remaining <= 0;
  const warning = remaining > 0 && remaining <= Math.ceil(slaDays * 0.25);

  let cls = "sla-ok";
  let label = "Op schema";
  if (atRisk) { cls = "sla-risk"; label = "SLA OVERSCHREDEN"; }
  else if (warning) { cls = "sla-warning"; label = "SLA bijna overschreden"; }

  return (
    <div className={`sla-indicator ${cls}`}>
      <span className="sla-icon">{atRisk ? "⚠" : warning ? "◷" : "◷"}</span>
      <div>
        <strong>{label}</strong>
        <span>{daysRunning} / {slaDays} dagen — {remaining <= 0 ? `${Math.abs(remaining)} dag${Math.abs(remaining) !== 1 ? "en" : ""} over tijd` : `${remaining} dag${remaining !== 1 ? "en" : ""} resterend`}</span>
      </div>
      <div className="sla-bar">
        <div className="sla-bar-fill" style={{ width: `${Math.min(100, (daysRunning / slaDays) * 100)}%` }} />
      </div>
    </div>
  );
}

function StatusWorkflow({ currentStatus }: { currentStatus: string }) {
  const currentIdx = STATUS_ORDER.indexOf(currentStatus as Status);
  if (currentIdx === -1) return null;

  return (
    <div className="status-workflow" role="region" aria-label="Status workflow">
      <p className="eyebrow">STATUS</p>
      <div className="workflow-steps">
        {STATUS_ORDER.map((status, i) => {
          const isDone = i < currentIdx;
          const isCurrent = i === currentIdx;
          const isFuture = i > currentIdx;
          const colors = STATUS_COLORS[status];

          return (
            <div key={status} className={`workflow-step ${isDone ? "done" : ""} ${isCurrent ? "current" : ""} ${isFuture ? "future" : ""}`}>
              <div className="workflow-step-indicator" style={{
                background: isDone || isCurrent ? colors.dot : "var(--line)",
                color: isDone || isCurrent ? "#fff" : "var(--muted)",
              }}>
                {isDone ? "✓" : isCurrent ? "●" : String(i + 1)}
              </div>
              <div className="workflow-step-label">
                <strong>{STATUS_LABELS[status]}</strong>
                {isCurrent && <span className="workflow-current-badge">Huidig</span>}
              </div>
            </div>
          );
        })}
        <div className="workflow-progress" style={{
          background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${(currentIdx / (STATUS_ORDER.length - 1)) * 100}%, var(--line) ${(currentIdx / (STATUS_ORDER.length - 1)) * 100}%, var(--line) 100%)`,
        }} />
      </div>
    </div>
  );
}

export default async function ChangeRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const request = await getChangeRequest(id);
  if (!request) notFound();

  const isNewBenchmark = request.changeType === "new_benchmark";
  const slaWeeks = request.slaLeadWeeks || (isNewBenchmark ? 4 : 1);

  return (
    <div className="page-shell request-shell">
      <div className="request-header">
        <div>
          <p className="eyebrow">
            <Link href="/changes" style={{ color: "inherit", textDecoration: "none" }}>CHANGE REQUEST</Link>
            {" · "}{request.reference}
          </p>
          <h1>{isNewBenchmark ? "Nieuwe benchmark" : "Benchmarkwissel"}</h1>
          <p>{request.clientName} · {request.clientReference}</p>
        </div>
      </div>

      {/* Workflow + SLA row */}
      <div className="detail-workflow-row">
        <StatusWorkflow currentStatus={request.status} />
        <SlaTimer createdAt={request.createdAt} slaWeeks={slaWeeks} status={request.status} />
      </div>

      <section className="request-overview" aria-label="Aanvraag overzicht">
        <div><span>Aanvrager</span><b>{request.requestedBy}</b></div>
        <div><span>Ingangsdatum</span><b>{new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(new Date(request.effectiveDate))}</b></div>
        <div><span>Type</span><b>{isNewBenchmark ? "Nieuwe benchmark" : "Normale change"}</b></div>
        <div><span>Scope</span><b>{isNewBenchmark ? "1 nieuwe benchmark" : `${request.items.length} portefeuille(s)`}</b></div>
        <div><span>SLA</span><b>{slaWeeks} week{slaWeeks !== 1 ? "en" : ""}</b></div>
      </section>

      {isNewBenchmark && request.newBenchmark ? (
        <section className="nb-detail">
          <h2>Nieuwe benchmark specificaties</h2>
          <div className="nb-detail-grid">
            <div className="nb-detail-item">
              <span>Short name</span>
              <span>{request.newBenchmark.shortName}</span>
            </div>
            <div className="nb-detail-item">
              <span>Long name</span>
              <span>{request.newBenchmark.longName}</span>
            </div>
            <div className="nb-detail-item">
              <span>Asset class</span>
              <span>{request.newBenchmark.assetClass}</span>
            </div>
            <div className="nb-detail-item">
              <span>Valuta</span>
              <span>{request.newBenchmark.currency}</span>
            </div>
            <div className="nb-detail-item">
              <span>Geschatte kosten</span>
              <span>€ {request.newBenchmark.estimatedCost.toLocaleString("nl-NL")}</span>
            </div>
            <div className="nb-detail-item">
              <span>Doorlooptijd</span>
              <span>{request.newBenchmark.estimatedLeadWeeks} weken</span>
            </div>
          </div>
        </section>
      ) : (
        <section className="diff-section">
          <div className="diff-heading">
            <div>
              <p className="eyebrow">CONFIGURATIEVERSCHIL</p>
              <h2>IST / SOLL</h2>
            </div>
            <p>De beoogde configuratie is per portefeuille traceerbaar naast de huidige, overeengekomen situatie.</p>
          </div>
          <div className="git-diff">
            <div className="diff-file">client-config/{request.clientReference}.yaml</div>
            {request.items.map((item) => (
              <div className="diff-block" key={item.portfolioReference}>
                <p className="diff-context">portfolio: {item.portfolioName} <span>#{item.portfolioReference}</span></p>
                <div className="diff-line diff-remove"><i>−</i><code>benchmark: {item.previousBenchmark.code}</code><span>{item.previousBenchmark.name}</span></div>
                <div className="diff-line diff-add"><i>+</i><code>benchmark: {item.requestedBenchmark.code}</code><span>{item.requestedBenchmark.name}</span></div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Admin feedback section */}
      <ChangeStatusSection
        changeId={request.id}
        currentStatus={request.status}
        createdAt={request.createdAt}
        processedAt={request.processedAt}
        processedBy={request.processedBy}
        validatedAt={request.validatedAt}
        validatedBy={request.validatedBy}
        notificationSent={request.notificationSent}
      />

      <section className="handoff-grid" aria-label="Onderbouwing en distributie">
        <article>
          <p className="eyebrow">ONDERBOUWING</p>
          <h2>Waarom deze {isNewBenchmark ? "aanvraag" : "change"}?</h2>
          <p>{request.rationale}</p>
        </article>
        <article>
          <p className="eyebrow">DISTRIBUTIE</p>
          <h2>Stakeholders</h2>
          <ul>
            <li>Eigen administratie</li>
            <li>Asset service provider</li>
            <li>FactSet</li>
          </ul>
        </article>
      </section>

      <div className="bottom-actions">
        <Link className="button button-secondary" href={isNewBenchmark ? "/benchmark-aanvraag" : "/changes/new"}>
          {isNewBenchmark ? "Nieuwe benchmark" : "Nieuwe benchmarkwissel"}
        </Link>
        <Link className="button button-ghost" href="/changes">
          ← Alle changes
        </Link>
        <ExportButton changeRequestId={id} />
      </div>
    </div>
  );
}
