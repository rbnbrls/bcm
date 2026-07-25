import Link from "next/link";
import { getClientsWithChanges } from "@/lib/db";

export default async function HistoryOverviewPage() {
  const clients = await getClientsWithChanges();

  return (
    <div className="page-shell">
      <div className="page-intro">
        <p className="eyebrow">WIJZIGINGSHISTORIE</p>
        <h1>Alle changes per klant</h1>
        <p className="hero-copy">Bekijk alle benchmarkwissels en nieuwe benchmark-aanvragen per klant. Geschikt voor audits en klantrapportages.</p>
      </div>

      {clients.length === 0 ? (
        <div className="empty-state">
          <h2>Nog geen changes</h2>
          <p>Er zijn nog geen change requests ingediend. Zodra er changes worden ingediend verschijnen ze hier.</p>
        </div>
      ) : (
        <div className="history-grid">
          {clients.map((client) => (
            <Link href={`/changes/history/${client.externalReference}`} key={client.id} className="history-card">
              <div className="history-card-info">
                <div className="history-card-title">{client.name}</div>
                <div className="history-card-meta">
                  <span>Referentie: {client.externalReference}</span>
                </div>
              </div>
              <div className="history-card-right">
                <div className="history-card-date">
                  <span className="status-pill">{client.changeCount} change{client.changeCount !== 1 ? "s" : ""}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="bottom-actions" style={{ marginTop: 40 }}>
        <Link className="button button-secondary" href="/">Terug naar dashboard</Link>
      </div>
    </div>
  );
}
