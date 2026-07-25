import Link from "next/link";
import { getClientConfigs, getAllChangeRequests } from "@/lib/db";
import { CHANGE_STATUS_LABELS, type ChangeStatus } from "@/lib/types";

export default async function HomePage() {
  const [clientConfigs, changes] = await Promise.all([getClientConfigs(), getAllChangeRequests()]);
  const portfolioCount = clientConfigs.reduce((count, client) => count + client.portfolios.length, 0);
  const recentChanges = changes.slice(0, 5);
  const pendingCount = changes.filter((c) => c.status === "submitted" || c.status === "accepted" || c.status === "in_progress").length;

  const STATUS_STYLES: Record<string, { bg: string; dot: string }> = {
    submitted: { bg: "#dff4e9", dot: "#0f6d55" },
    accepted: { bg: "#e3eaf5", dot: "#28497c" },
    in_progress: { bg: "#fff3d6", dot: "#c8950c" },
    processed: { bg: "#e8f5e9", dot: "#2e7d32" },
    validated: { bg: "#dff4e9", dot: "#0a513f" },
  };

  return (
    <div className="page-shell home-shell">
      <section className="hero" role="region" aria-label="Introductie">
        <p className="eyebrow">BUSINESS CHANGE MANAGEMENT</p>
        <h1>Veranderingen direct<br />goed aanvragen.</h1>
        <p className="hero-copy">Van klantafspraak naar een compleet, controleerbaar change request voor administratie, asset servicing en performance.</p>
        <Link className="button button-primary" href="/changes/new">Start benchmarkwissel <span>→</span></Link>
      </section>
      <section className="status-grid" aria-label="Overzicht">
        <article className="stat-card" aria-label="Actieve klanten"><p>Actieve klanten</p><strong>{clientConfigs.length}</strong><span>Client config beschikbaar</span></article>
        <article className="stat-card" aria-label="Portefeuilles"><p>Portefeuilles</p><strong>{portfolioCount}</strong><span>Voorgeladen uit afspraken</span></article>
        <article className="stat-card" aria-label="Openstaande changes"><p>Openstaand</p><strong>{pendingCount}</strong><span>In behandeling</span></article>
        <article className="stat-card" aria-label="Totaal changes"><p>Totaal changes</p><strong>{changes.length}</strong><span><Link href="/changes">Bekijk overzicht →</Link></span></article>
      </section>

      {recentChanges.length > 0 && (
        <section className="workflow-card" aria-label="Recente changes" style={{ marginTop: 32 }}>
          <div>
            <p className="eyebrow">RECENTE CHANGES</p>
            <h2>Laatste wijzigingen</h2>
          </div>
          <div style={{ marginTop: 16 }}>
            {recentChanges.map((change) => {
              const style = STATUS_STYLES[change.status] ?? { bg: "#eef1ed", dot: "#5d6864" };
              return (
                <Link key={change.id} href={`/changes/${change.id}`} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 14px", borderRadius: 8, transition: "background .15s",
                  textDecoration: "none", color: "inherit",
                }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "2px 8px", borderRadius: 100, fontSize: 11,
                    fontWeight: 700, background: style.bg, color: style.dot, whiteSpace: "nowrap", flexShrink: 0,
                  }}>
                    {CHANGE_STATUS_LABELS[change.status as ChangeStatus] || change.status}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>{change.reference}</span>
                  <span style={{ color: "var(--muted)", fontSize: 12.5 }}>{change.clientName}</span>
                  <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 12 }}>
                    {new Date(change.createdAt).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
                  </span>
                </Link>
              );
            })}
          </div>
          <div style={{ marginTop: 12 }}>
            <Link className="button button-ghost" href="/changes">Alle changes bekijken →</Link>
          </div>
        </section>
      )}

      <section className="workflow-card" style={{ marginTop: 56 }} aria-label="Benchmarkwissel use case">
        <div>
          <p className="eyebrow">EERSTE USE CASE</p>
          <h2>Benchmarkwissel</h2>
          <p>Selecteer een klant en één of meer portefeuilles. BCM vult de huidige benchmark vanuit de client config in en laat de gewenste situatie als een heldere IST/SOLL-diff zien.</p>
        </div>
        <ol className="steps">
          <li><b>01</b><span>Klant en portefeuilles</span></li>
          <li><b>02</b><span>Nieuwe benchmark</span></li>
          <li><b>03</b><span>Compleet request</span></li>
        </ol>
      </section>
      <section className="workflow-card alt" aria-label="Nieuwe benchmark use case">
        <div>
          <p className="eyebrow">TWEEDE USE CASE</p>
          <h2>Nieuwe benchmark aanvragen</h2>
          <p>Vraag een benchmark aan die nog niet in de catalogus staat. Bij een benchmarkwissel kan ook een nieuwe benchmark worden aangevraagd (+4 weken, € 5.000).</p>
        </div>
        <div className="use-case-actions">
          <Link className="button button-secondary" href="/benchmark-aanvraag">Aanvragen →</Link>
          <Link className="button button-ghost" href="/benchmarks">Catalogus bekijken →</Link>
        </div>
      </section>
    </div>
  );
}
