import Link from "next/link";
import { notFound } from "next/navigation";
import { getChangeRequest, getAuditLogs, getApprovals, getChangeTypeBySlug } from "@/lib/db";
import { ExportButton } from "@/components/export-button";
import { ApprovalPanel } from "@/components/approval-panel";
import { ChangeTypeWorkflow } from "@/components/change-type-workflow";
import { BenchmarkFieldDiff } from "@/components/benchmark-field-diff";
import { StagedConfigDiff } from "@/components/staged-config-diff";
import { AmendableStagedConfig } from "@/components/staged-config-amendable";

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    submitted: "Ingediend",
    pending_approval: "Wacht op akkoord",
    approved: "Goedgekeurd",
    rejected: "Afgewezen",
    draft: "Concept",
  };
  const label = labels[status] ?? status;
  const className = `status-pill status-pill--${status}`;
  return <span className={className} role="status" aria-live="polite">{label}</span>;
}

export default async function ChangeRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const request = await getChangeRequest(id);
  if (!request) notFound();

  const [auditLogs, approvals] = await Promise.all([
    getAuditLogs(id),
    getApprovals(id),
  ]);

  const changeTypeName = request.changeTypeConfig?.name
    ?? (request.changeType === "new_benchmark" ? "Nieuwe benchmark" : "Benchmarkwissel");
  const isNewBenchmark = request.changeTypeConfig?.slug === "new_benchmark" || request.changeType === "new_benchmark";
  const needsApproval = request.status === "pending_approval" || request.status === "submitted";
  const isTerminal = request.status === "approved" || request.status === "rejected";

  const formatDateTime = (dateStr: string): string => {
    try {
      return new Intl.DateTimeFormat("nl-NL", {
        dateStyle: "long",
        timeStyle: "short",
      }).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  };

  const actionLabels: Record<string, string> = {
    requested: "Aangevraagd",
    approved: "Goedgekeurd",
    rejected: "Afgewezen",
    status_change: "Statuswijziging",
  };

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
        <StatusBadge status={request.status} />
      </div>

      {/* Process flow diagram */}
      {request.changeTypeConfig && (
        <section className="detail-workflow-section" aria-label="Procesflow" style={{ marginBottom: 18 }}>
          <ChangeTypeWorkflow config={request.changeTypeConfig} />
        </section>
      )}

      <section className="request-overview" aria-label="Aanvraag overzicht">
        <div><span>Aanvrager</span><b>{request.requestedBy}</b></div>
        <div><span>Ingangsdatum</span><b>{new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(new Date(request.effectiveDate))}</b></div>
        <div><span>Type</span><b>{changeTypeName}</b></div>
        <div><span>Scope</span><b>{isNewBenchmark ? "1 nieuwe benchmark" : `${request.items.length} portefeuille(s)`}</b></div>
        <div><span>SLA</span><b>{request.slaLeadWeeks} week{request.slaLeadWeeks !== 1 ? "en" : ""}</b></div>
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
      ) : request.changeTypeConfig && request.fields && request.fields.length > 0 ? (
        <section className="diff-section">
          <div className="diff-heading">
            <div>
              <p className="eyebrow">CONFIGURATIEVERSCHIL</p>
              <h2>IST / SOLL</h2>
            </div>
            <p>De beoogde configuratie is traceerbaar naast de huidige, overeengekomen situatie.</p>
          </div>
          <div className="git-diff">
            <div className="diff-file">client-config/{request.clientReference}.yaml</div>
            {request.fields.map((field) => {
              if (field.istValue === field.sollValue) return null; // skip identical fields
              const fieldConfig = request.changeTypeConfig?.fields?.find((f) => f.key === field.fieldKey);
              const label = fieldConfig?.label ?? field.fieldKey;
              const isBenchmarkField = fieldConfig?.type === "benchmark";
              return (
                <div className="diff-block" key={field.fieldKey}>
                  <p className="diff-context">{label}</p>
                  {isBenchmarkField ? (
                    <>
                      <BenchmarkFieldDiff
                        value={String(field.istValue ?? "—")}
                        isIst={true}
                        label={label}
                      />
                      <BenchmarkFieldDiff
                        value={String(field.sollValue ?? "—")}
                        isIst={false}
                        label={label}
                      />
                    </>
                  ) : (
                    <>
                      <div className="diff-line diff-remove"><i>−</i><code>{String(field.istValue ?? "—")}</code></div>
                      <div className="diff-line diff-add"><i>+</i><code>{String(field.sollValue ?? "—")}</code></div>
                    </>
                  )}
                </div>
              );
            })}
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

      {/* Staged client-config changes — with inline amend for submitted/accepted */}
      {request.changePortfolioConfigurations && request.changePortfolioConfigurations.length > 0 && (
        <AmendableStagedConfig
          rows={request.changePortfolioConfigurations}
          changeRequestId={request.id}
          changeStatus={request.status}
        />
      )}

      {/* Four-eyes Approval Section */}
      {needsApproval && (
        <section className="approval-section" aria-label="Goedkeuring">
          <div className="diff-heading">
            <div>
              <p className="eyebrow">VIER-OGENPRINCIPE</p>
              <h2>Akkoord benodigd</h2>
            </div>
            <p>Een senior portfoliomanager of compliance moet deze change accorderen voordat deze naar administratie, asset servicer en FactSet gaat.</p>
          </div>
          <ApprovalPanel changeRequestId={id} />
        </section>
      )}

      {/* Approval history (for approved/rejected) */}
      {approvals.length > 0 && (
        <section className="audit-section" aria-label="Goedkeuringshistorie">
          <div className="diff-heading">
            <div>
              <p className="eyebrow">GOEDKEURING</p>
              <h2>Besluit</h2>
            </div>
          </div>
          <div className="audit-timeline">
            {approvals.map((app) => (
              <div key={app.id} className="audit-entry audit-entry--approval">
                <div className="audit-marker">{app.decision === "approved" ? "✓" : "✗"}</div>
                <div className="audit-content">
                  <div className="audit-header">
                    <span className="audit-action">{app.decision === "approved" ? "Goedgekeurd" : "Afgewezen"}</span>
                    <span className="audit-actor">door {app.approver}</span>
                    <span className="audit-date">{formatDateTime(app.createdAt)}</span>
                  </div>
                  {app.remarks && <p className="audit-remarks">{app.remarks}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Audit Trail Section */}
      {auditLogs.length > 0 && (
        <section className="audit-section" aria-label="Audit trail">
          <div className="diff-heading">
            <div>
              <p className="eyebrow">AUDIT TRAIL</p>
              <h2>Wijzigingenlogboek</h2>
            </div>
            <p>Onveranderlijk logboek van alle gebeurtenissen rondom deze change, incl. timestamp en actor.</p>
          </div>
          <div className="audit-timeline">
            {auditLogs.map((entry) => (
              <div key={entry.id} className="audit-entry">
                <div className="audit-marker">{entry.action === "requested" ? "→" : entry.action === "approved" ? "✓" : entry.action === "rejected" ? "✗" : "●"}</div>
                <div className="audit-content">
                  <div className="audit-header">
                    <span className="audit-action">{actionLabels[entry.action] ?? entry.action}</span>
                    <span className="audit-actor">door {entry.actor}</span>
                    <span className="audit-date">{formatDateTime(entry.createdAt)}</span>
                  </div>
                  <div className="audit-status-flow">
                    {entry.previousStatus && <span className="audit-status-badge audit-status-badge--old">{entry.previousStatus}</span>}
                    {entry.previousStatus && <span className="audit-arrow">→</span>}
                    <span className="audit-status-badge audit-status-badge--new">{entry.newStatus}</span>
                    {entry.clientConfigVersion && <span className="audit-config-versie">config v{entry.clientConfigVersion}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

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
            {(request.changeTypeConfig?.stakeholders ?? []).length > 0
              ? request.changeTypeConfig!.stakeholders.map((s) => (
                  <li key={s.id}>{s.name}{s.mandatory ? " (verplicht)" : ""}</li>
                ))
              : (
                <>
                  <li>Eigen administratie</li>
                  <li>Asset service provider</li>
                  <li>FactSet</li>
                </>
              )
            }
          </ul>
        </article>
      </section>

      <div className="bottom-actions">
        <Link className="button button-secondary" href="/changes/new">
          Nieuwe change
        </Link>
        <Link className="button button-ghost" href="/changes">
          ← Alle changes
        </Link>
        <ExportButton changeRequestId={id} />
      </div>
    </div>
  );
}
