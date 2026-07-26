import Link from "next/link";
import { getAllChangeRequestsFull } from "@/lib/db";
import { aggregateClientVolume, getShortStatusLabel } from "@/lib/reports";

export const dynamic = "force-dynamic";

export default async function VolumeReportPage() {
  const changes = await getAllChangeRequestsFull();
  const report = aggregateClientVolume(changes);

  const totalChanges = changes.length;
  const maxVolume = report.length > 0 ? Math.max(...report.map((r) => r.totalChanges), 1) : 1;

  return (
    <div className="page-shell">
      <section style={{ marginBottom: 32 }}>
        <p className="eyebrow">RAPPORTAGES</p>
        <h1>Volume per klant</h1>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <Link href="/reports" className="button button-ghost">← Dashboard</Link>
          <a href="/api/reports?type=volume" className="button button-secondary" download>CSV downloaden</a>
        </div>
      </section>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16, marginBottom: 32 }}>
        <div className="stat-card" style={{ padding: 20 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase" }}>Totaal changes</p>
          <strong style={{ fontSize: 28, display: "block", marginTop: 4 }}>{totalChanges}</strong>
        </div>
        <div className="stat-card" style={{ padding: 20 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase" }}>Aantal klanten</p>
          <strong style={{ fontSize: 28, display: "block", marginTop: 4 }}>{report.length}</strong>
        </div>
        <div className="stat-card" style={{ padding: 20 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase" }}>Gem. per klant</p>
          <strong style={{ fontSize: 28, display: "block", marginTop: 4 }}>
            {report.length > 0 ? Math.round((totalChanges / report.length) * 10) / 10 : 0}
          </strong>
        </div>
      </div>

      {/* Client volume chart */}
      {report.length > 0 && (
        <section className="workflow-card" style={{ marginBottom: 32 }}>
          <h2 style={{ marginBottom: 16 }}>Volume per klant</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {report.map((client) => {
              const pct = (client.totalChanges / maxVolume) * 100;
              const processedCount = (client.byStatus["processed"] || 0) + (client.byStatus["validated"] || 0);
              const pendingCount = client.totalChanges - processedCount;
              const processedPct = client.totalChanges > 0 ? (processedCount / client.totalChanges) * 100 : 0;
              const pendingPct = client.totalChanges > 0 ? (pendingCount / client.totalChanges) * 100 : 0;

              return (
                <div key={client.clientId}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
                    <span style={{ fontWeight: 600 }}>{client.clientName}</span>
                    <span style={{ color: "var(--muted)" }}>
                      {client.totalChanges} changes ({processedCount} verwerkt, {pendingCount} open)
                    </span>
                  </div>
                  <div style={{ height: 28, background: "var(--surface)", borderRadius: 4, overflow: "hidden", display: "flex" }}>
                    {processedCount > 0 && (
                      <div style={{
                        width: `${processedPct}%`, height: "100%",
                        background: "#2e7d32", borderRadius: "4px 0 0 4px",
                        transition: "width 0.3s",
                      }} title={`Verwerkt: ${processedCount}`} />
                    )}
                    {pendingCount > 0 && (
                      <div style={{
                        width: `${pendingPct}%`, height: "100%",
                        background: "#e65100", borderRadius: pendingPct === 100 ? 4 : "0 4px 4px 0",
                        transition: "width 0.3s",
                      }} title={`Openstaand: ${pendingCount}`} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 12, color: "var(--muted)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 12, height: 12, background: "#2e7d32", borderRadius: 2 }} /> Verwerkt</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 12, height: 12, background: "#e65100", borderRadius: 2 }} /> Openstaand</span>
          </div>
        </section>
      )}

      {/* Client detail tables */}
      {report.map((client) => {
        const clientChanges = changes.filter((c) => c.clientId === client.clientId);
        return (
          <section className="workflow-card" key={client.clientId} style={{ marginBottom: 16 }}>
            <h2 style={{ marginBottom: 8 }}>{client.clientName}</h2>

            <div style={{ display: "flex", gap: 16, marginBottom: 16, fontSize: 13 }}>
              <span>Totaal: <strong>{client.totalChanges}</strong></span>
              {Object.entries(client.byStatus).map(([status, count]) => (
                <span key={status}>{getShortStatusLabel(status)}: <strong>{count}</strong></span>
              ))}
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border)" }}>
                    <th style={{ textAlign: "left", padding: "6px 10px" }}>Referentie</th>
                    <th style={{ textAlign: "left", padding: "6px 10px" }}>Type</th>
                    <th style={{ textAlign: "left", padding: "6px 10px" }}>Status</th>
                    <th style={{ textAlign: "right", padding: "6px 10px" }}>Aangemaakt</th>
                  </tr>
                </thead>
                <tbody>
                  {clientChanges.slice(0, 20).map((c) => (
                    <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "6px 10px", fontWeight: 600 }}>{c.reference}</td>
                      <td style={{ padding: "6px 10px" }}>{c.changeType}</td>
                      <td style={{ padding: "6px 10px" }}>{getShortStatusLabel(c.status)}</td>
                      <td style={{ textAlign: "right", padding: "6px 10px", color: "var(--muted)", fontSize: 12 }}>
                        {new Date(c.createdAt).toLocaleDateString("nl-NL")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {report.length === 0 && (
        <p style={{ color: "var(--muted)" }}>Nog geen gegevens beschikbaar.</p>
      )}
    </div>
  );
}
