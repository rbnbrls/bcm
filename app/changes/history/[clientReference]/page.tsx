import Link from "next/link";
import { notFound } from "next/navigation";
import { getChangeHistoryByClient, getChangeTypes, getClientConfigs } from "@/lib/db";

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    submitted: "Ingediend",
    pending_approval: "Wacht op akkoord",
    approved: "Goedgekeurd",
    rejected: "Afgewezen",
    draft: "Concept",
  };
  return labels[status] ?? status;
}

export default async function ClientHistoryPage({ params }: { params: Promise<{ clientReference: string }> }) {
  const { clientReference } = await params;
  const [changes, clientConfigs, changeTypes] = await Promise.all([
    getChangeHistoryByClient(clientReference),
    getClientConfigs(),
    getChangeTypes(),
  ]);
  const typeNameMap = new Map(changeTypes.map((ct) => [ct.slug, ct.name]));

  const client = clientConfigs.find((c) => c.externalReference === clientReference);
  if (!client && changes.length === 0) notFound();

  const formatDate = (dateStr: string): string => {
    try {
      return new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  };

  const clientName = client?.name ?? changes[0]?.clientName ?? clientReference;

  return (
    <div className="page-shell">
      <div className="page-intro">
        <p className="eyebrow">WIJZIGINGSHISTORIE</p>
        <h1>{clientName}</h1>
        <p className="hero-copy">
          {changes.length > 0
            ? `Alle change requests voor ${clientName} — ${changes.length} wijziging${changes.length !== 1 ? "en" : ""} gevonden.`
            : `Geen change requests gevonden voor ${clientName}.`}
        </p>
      </div>

      {changes.length === 0 ? (
        <div className="empty-state">
          <h2>Nog geen changes</h2>
          <p>Er zijn nog geen change requests ingediend voor deze klant.</p>
        </div>
      ) : (
        <div className="history-grid">
          {changes.map((change) => (
            <Link href={`/changes/${change.id}`} key={change.id} className="history-card">
              <div className="history-card-info">
                <div className="history-card-title">
                  <Link href={`/changes/${change.id}`} className="history-card-title">
                    {change.reference} — {typeNameMap.get(change.changeType) ?? (change.changeType === "new_benchmark" ? "Nieuwe benchmark" : change.changeType === "portfolio_configuration_retire" ? "Portefeuilleconfiguratie beëindigen" : "Benchmarkwissel")}
                  </Link>
                </div>
                <div className="history-card-meta">
                  <span>Aanvrager: {change.requestedBy}</span>
                  <span>Ingangsdatum: {formatDate(change.effectiveDate)}</span>
                </div>
              </div>
              <div className="history-card-right">
                <div className="history-card-date">{formatDate(change.createdAt)}</div>
                <span className={`status-pill status-pill--${change.status}`}>{statusLabel(change.status)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="bottom-actions" style={{ marginTop: 40 }}>
        <Link className="button button-secondary" href="/changes/history">← Alle klanten</Link>
        <Link className="button button-primary" href="/changes/new">Nieuwe benchmarkwissel</Link>
      </div>
    </div>
  );
}
