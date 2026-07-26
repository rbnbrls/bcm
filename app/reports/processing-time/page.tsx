import Link from "next/link";
import { getAllChangeRequestsFull } from "@/lib/db";
import { buildProcessingTimeReport, getShortStatusLabel } from "@/lib/reports";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export default async function ProcessingTimeReportPage() {
  const changes = await getAllChangeRequestsFull();
  const report = buildProcessingTimeReport(changes);

  const avgActual = report.filter((r) => r.actualDays != null).reduce((s, r) => s + (r.actualDays ?? 0), 0) /
    Math.max(report.filter((r) => r.actualDays != null).length, 1);
  const avgEstimated = report.reduce((s, r) => s + r.estimatedDays, 0) / Math.max(report.length, 1);
  const avgVariance = report.filter((r) => r.varianceDays != null).reduce((s, r) => s + (r.varianceDays ?? 0), 0) /
    Math.max(report.filter((r) => r.varianceDays != null).length, 1);

  return (
    <div className="page-shell">
      <section style={{ marginBottom: 32 }}>
        <p className="eyebrow">RAPPORTAGES</p>
        <h1>Doorlooptijd</h1>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <Link href="/reports" className="button button-ghost">← Dashboard</Link>
          <a href="/api/reports?type=processing-time" className="button button-secondary" download>CSV downloaden</a>
        </div>
      </section>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16, marginBottom: 32 }}>
        <div className="stat-card" style={{ padding: 20 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase" }}>Gem. werkelijk</p>
          <strong style={{ fontSize: 28, display: "block", marginTop: 4 }}>{avgActual.toFixed(1)} dgn</strong>
        </div>
        <div className="stat-card" style={{ padding: 20 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase" }}>Gem. geschat</p>
          <strong style={{ fontSize: 28, display: "block", marginTop: 4 }}>{avgEstimated.toFixed(1)} dgn</strong>
        </div>
        <div className="stat-card" style={{ padding: 20 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase" }}>Gem. variantie</p>
          <strong style={{ fontSize: 28, display: "block", marginTop: 4, color: avgVariance > 0 ? "#d32f2f" : "#2e7d32" }}>
            {avgVariance > 0 ? "+" : ""}{avgVariance.toFixed(1)} dgn
          </strong>
        </div>
        <div className="stat-card" style={{ padding: 20 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase" }}>Totaal changes</p>
          <strong style={{ fontSize: 28, display: "block", marginTop: 4 }}>{report.length}</strong>
        </div>
      </div>

      {/* Chart */}
      {report.filter((r) => r.actualDays != null).length > 0 && (
        <section className="workflow-card" style={{ marginBottom: 32 }}>
          <h2 style={{ marginBottom: 16 }}>Werkelijk vs. geschat (dagen)</h2>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 200, padding: "0 4px" }}>
            {report.filter((r) => r.actualDays != null).slice(0, 30).map((r) => {
              const maxVal = Math.max(r.actualDays ?? 0, r.estimatedDays, 1);
              const barH = Math.max((maxVal / 60) * 180, 4);
              const actualH = Math.max(((r.actualDays ?? 0) / maxVal) * barH, 4);
              const estH = Math.max((r.estimatedDays / maxVal) * barH, 4);
              return (
                <div key={r.changeRequestId} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div style={{ width: "100%", maxWidth: 30, height: barH, display: "flex", flexDirection: "column-reverse", gap: 1 }}>
                    <div style={{ width: "100%", height: `${(estH / barH) * 100}%`, background: "#1565c0", borderRadius: "2px 2px 0 0", opacity: 0.6 }} title={`Geschat: ${r.estimatedDays} dgn`} />
                    <div style={{ width: "100%", height: `${(actualH / barH) * 100}%`, background: actualH > estH ? "#d32f2f" : "#2e7d32", borderRadius: "2px 2px 0 0" }} title={`Werkelijk: ${r.actualDays} dgn`} />
                  </div>
                  <span style={{ fontSize: 9, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 50, textAlign: "center" }}>
                    {r.reference}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 12, color: "var(--muted)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 12, height: 12, background: "#1565c0", borderRadius: 2, opacity: 0.6 }} /> Geschat</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 12, height: 12, background: "#2e7d32", borderRadius: 2 }} /> Werkelijk</span>
          </div>
        </section>
      )}

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
                  <th style={{ textAlign: "right", padding: "8px 12px" }}>Werkelijk (dgn)</th>
                  <th style={{ textAlign: "right", padding: "8px 12px" }}>Geschat (dgn)</th>
                  <th style={{ textAlign: "right", padding: "8px 12px" }}>Variantie (dgn)</th>
                  <th style={{ textAlign: "right", padding: "8px 12px" }}>Variantie (%)</th>
                  <th style={{ textAlign: "left", padding: "8px 12px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {report.map((r) => (
                  <tr key={r.changeRequestId} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 12px", fontWeight: 600 }}>{r.reference}</td>
                    <td style={{ padding: "8px 12px" }}>{r.clientName}</td>
                    <td style={{ padding: "8px 12px" }}>{r.changeType}</td>
                    <td style={{ textAlign: "right", padding: "8px 12px" }}>{r.actualDays != null ? r.actualDays : "—"}</td>
                    <td style={{ textAlign: "right", padding: "8px 12px" }}>{r.estimatedDays}</td>
                    <td style={{ textAlign: "right", padding: "8px 12px", color: r.varianceDays != null && r.varianceDays > 0 ? "#d32f2f" : r.varianceDays != null && r.varianceDays < 0 ? "#2e7d32" : "inherit" }}>
                      {r.varianceDays != null ? (r.varianceDays > 0 ? "+" : "") + r.varianceDays : "—"}
                    </td>
                    <td style={{ textAlign: "right", padding: "8px 12px", color: r.variancePct != null && r.variancePct > 0 ? "#d32f2f" : r.variancePct != null && r.variancePct < 0 ? "#2e7d32" : "inherit" }}>
                      {r.variancePct != null ? (r.variancePct > 0 ? "+" : "") + r.variancePct + "%" : "—"}
                    </td>
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
