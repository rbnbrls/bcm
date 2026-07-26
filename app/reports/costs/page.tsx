import Link from "next/link";
import { getAllChangeRequestsFull } from "@/lib/db";
import { buildCostReport, getShortStatusLabel } from "@/lib/reports";

export const dynamic = "force-dynamic";

export default async function CostsReportPage() {
  const changes = await getAllChangeRequestsFull();
  const report = buildCostReport(changes);

  const totalEstimated = report.reduce((s, r) => s + (r.estimatedCost ?? 0), 0);
  const changesWithCost = report.filter((r) => r.estimatedCost != null);

  return (
    <div className="page-shell">
      <section style={{ marginBottom: 32 }}>
        <p className="eyebrow">RAPPORTAGES</p>
        <h1>Kosten</h1>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <Link href="/reports" className="button button-ghost">← Dashboard</Link>
          <a href="/api/reports?type=cost" className="button button-secondary" download>CSV downloaden</a>
        </div>
      </section>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
        <div className="stat-card" style={{ padding: 20 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase" }}>Totale geschatte kosten</p>
          <strong style={{ fontSize: 28, display: "block", marginTop: 4 }}>
            {new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(totalEstimated)}
          </strong>
        </div>
        <div className="stat-card" style={{ padding: 20 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase" }}>Changes met kosten</p>
          <strong style={{ fontSize: 28, display: "block", marginTop: 4 }}>{changesWithCost.length}</strong>
        </div>
        <div className="stat-card" style={{ padding: 20 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase" }}>Changes zonder kosten</p>
          <strong style={{ fontSize: 28, display: "block", marginTop: 4 }}>{report.length - changesWithCost.length}</strong>
        </div>
        <div className="stat-card" style={{ padding: 20 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase" }}>Gem. kosten</p>
          <strong style={{ fontSize: 28, display: "block", marginTop: 4 }}>
            {changesWithCost.length > 0
              ? new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(totalEstimated / changesWithCost.length)
              : "—"}
          </strong>
        </div>
      </div>

      {/* Cost by type chart */}
      {changesWithCost.length > 0 && (() => {
        const byType = new Map<string, number>();
        const byTypeCount = new Map<string, number>();
        for (const r of changesWithCost) {
          byType.set(r.changeType, (byType.get(r.changeType) || 0) + (r.estimatedCost ?? 0));
          byTypeCount.set(r.changeType, (byTypeCount.get(r.changeType) || 0) + 1);
        }
        const maxCost = Math.max(...byType.values(), 1);
        const costColors = ["#1565c0", "#2e7d32", "#e65100", "#6a1b9a", "#c62828", "#283593", "#00838f"];

        return (
          <section className="workflow-card" style={{ marginBottom: 32 }}>
            <h2 style={{ marginBottom: 16 }}>Kosten per type</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[...byType.entries()].map(([type, cost], i) => {
                const pct = (cost / maxCost) * 100;
                return (
                  <div key={type}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
                      <span style={{ fontWeight: 600 }}>{type} ({byTypeCount.get(type)})</span>
                      <span style={{ color: "var(--muted)" }}>
                        {new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cost)}
                      </span>
                    </div>
                    <div style={{ height: 24, background: "var(--surface)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{
                        width: `${Math.max(pct, 2)}%`, height: "100%",
                        background: costColors[i % costColors.length],
                        borderRadius: 4, transition: "width 0.3s",
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })()}

      {/* Table */}
      <section className="workflow-card">
        <h2 style={{ marginBottom: 16 }}>Alle changes</h2>
        {report.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px" }}>Referentie</th>
                  <th style={{ textAlign: "left", padding: "8px 12px" }}>Klant</th>
                  <th style={{ textAlign: "left", padding: "8px 12px" }}>Type</th>
                  <th style={{ textAlign: "right", padding: "8px 12px" }}>Geschatte kosten</th>
                  <th style={{ textAlign: "right", padding: "8px 12px" }}>Valuta</th>
                  <th style={{ textAlign: "left", padding: "8px 12px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {report.map((r) => (
                  <tr key={r.changeRequestId} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 12px", fontWeight: 600 }}>{r.reference}</td>
                    <td style={{ padding: "8px 12px" }}>{r.clientName}</td>
                    <td style={{ padding: "8px 12px" }}>{r.changeType}</td>
                    <td style={{ textAlign: "right", padding: "8px 12px" }}>
                      {r.estimatedCost != null
                        ? new Intl.NumberFormat("nl-NL", { style: "currency", currency: r.estimatedCostCurrency }).format(r.estimatedCost)
                        : "—"}
                    </td>
                    <td style={{ textAlign: "right", padding: "8px 12px" }}>{r.estimatedCostCurrency}</td>
                    <td style={{ padding: "8px 12px" }}>{getShortStatusLabel(r.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: "var(--muted)" }}>Nog geen gegevens beschikbaar.</p>
        )}
      </section>
    </div>
  );
}
