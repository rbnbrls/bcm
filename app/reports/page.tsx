import Link from "next/link";
import { getAllChangeRequestsFull } from "@/lib/db";
import { buildDashboardSummary } from "@/lib/reports";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const changes = await getAllChangeRequestsFull();
  const summary = buildDashboardSummary(changes);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(val);

  const maxVolume = summary.monthlyVolume.length > 0
    ? Math.max(...summary.monthlyVolume.map((m) => m.count), 1)
    : 1;

  return (
    <div className="page-shell">
      <section style={{ marginBottom: 32 }}>
        <p className="eyebrow">RAPPORTAGES</p>
        <h1>Dashboard</h1>
      </section>

      <div className="report-cards" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
        <div className="stat-card" style={{ padding: 24 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Totaal changes</p>
          <strong style={{ fontSize: 32, display: "block", marginTop: 8 }}>{summary.totalChanges}</strong>
        </div>
        <div className="stat-card" style={{ padding: 24 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Openstaand</p>
          <strong style={{ fontSize: 32, display: "block", marginTop: 8 }}>{summary.pendingChanges}</strong>
        </div>
        <div className="stat-card" style={{ padding: 24 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Verwerkt</p>
          <strong style={{ fontSize: 32, display: "block", marginTop: 8 }}>{summary.processedChanges}</strong>
        </div>
        <div className="stat-card" style={{ padding: 24 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Gem. doorlooptijd</p>
          <strong style={{ fontSize: 32, display: "block", marginTop: 8 }}>
            {summary.avgProcessingDays != null ? `${summary.avgProcessingDays} dgn` : "—"}
          </strong>
        </div>
        <div className="stat-card" style={{ padding: 24 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Gem. schatting</p>
          <strong style={{ fontSize: 32, display: "block", marginTop: 8 }}>{summary.avgEstimatedDays} dgn</strong>
        </div>
        <div className="stat-card" style={{ padding: 24 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Totale kosten</p>
          <strong style={{ fontSize: 32, display: "block", marginTop: 8 }}>{formatCurrency(summary.totalEstimatedCost)}</strong>
        </div>
      </div>

      {/* Monthly volume chart */}
      <section className="workflow-card" style={{ marginBottom: 32 }}>
        <h2 style={{ marginBottom: 16 }}>Maandelijkse volume</h2>
        {summary.monthlyVolume.length > 0 ? (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 160, padding: "0 4px" }}>
            {summary.monthlyVolume.map((m) => {
              const pct = (m.count / maxVolume) * 100;
              return (
                <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>{m.count}</span>
                  <div
                    title={`${m.month}: ${m.count} changes`}
                    style={{
                      width: "100%", maxWidth: 40,
                      height: `${Math.max(pct, 4)}%`,
                      background: "var(--accent)",
                      borderRadius: "4px 4px 0 0",
                      transition: "height 0.3s",
                      minHeight: 4,
                    }}
                  />
                  <span style={{ fontSize: 10, color: "var(--muted)", transform: "rotate(-45deg)", whiteSpace: "nowrap" }}>
                    {m.month.slice(5)}/{m.month.slice(2, 4)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ color: "var(--muted)" }}>Nog geen gegevens beschikbaar.</p>
        )}
      </section>

      {/* Status breakdown */}
      <section className="workflow-card" style={{ marginBottom: 32 }}>
        <h2 style={{ marginBottom: 16 }}>Statusverdeling</h2>
        {Object.keys(summary.byStatus).length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {Object.entries(summary.byStatus).map(([status, count]) => (
              <div key={status} style={{
                padding: "8px 16px", borderRadius: 8, background: "var(--surface)",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>{status}</span>
                <strong style={{ fontSize: 18 }}>{count}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: "var(--muted)" }}>Nog geen gegevens beschikbaar.</p>
        )}
      </section>

      {/* Quick links */}
      <section>
        <h2 style={{ marginBottom: 16 }}>Rapportages</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          <Link href="/reports/processing-time" className="workflow-card" style={{ display: "block", textDecoration: "none", color: "inherit", padding: 24 }}>
            <h3>Doorlooptijd</h3>
            <p style={{ color: "var(--muted)", marginTop: 8 }}>Werkelijke vs. geschatte verwerkingstijd per change, met variantie-analyse.</p>
            <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: 13, marginTop: 12, display: "inline-block" }}>Bekijken →</span>
          </Link>
          <Link href="/reports/costs" className="workflow-card" style={{ display: "block", textDecoration: "none", color: "inherit", padding: 24 }}>
            <h3>Kosten</h3>
            <p style={{ color: "var(--muted)", marginTop: 8 }}>Overzicht van geschatte kosten per change, uitgesplitst per type.</p>
            <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: 13, marginTop: 12, display: "inline-block" }}>Bekijken →</span>
          </Link>
          <Link href="/reports/volume" className="workflow-card" style={{ display: "block", textDecoration: "none", color: "inherit", padding: 24 }}>
            <h3>Volume</h3>
            <p style={{ color: "var(--muted)", marginTop: 8 }}>Aantal changes per klant, uitgesplitst naar status en type.</p>
            <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: 13, marginTop: 12, display: "inline-block" }}>Bekijken →</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
