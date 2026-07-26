import Link from "next/link";
import { getClientConfigs, getAllChangeRequests, getChangeTypes } from "@/lib/db";
import { CHANGE_STATUS_LABELS, type ChangeStatus } from "@/lib/types";
import {
  sortChangeTypes,
  getActiveChangeTypes,
} from "@/lib/change-type-catalog";
import { ChangeTypeCatalog } from "@/components/change-type-catalog";

export default async function HomePage() {
  const [clientConfigs, changes, changeTypes] = await Promise.all([
    getClientConfigs(),
    getAllChangeRequests(),
    getChangeTypes(),
  ]);
  const portfolioCount = clientConfigs.reduce((count, client) => count + client.portfolios.length, 0);
  const recentChanges = changes.slice(0, 5);
  const pendingCount = changes.filter((c) => c.status === "submitted" || c.status === "accepted" || c.status === "in_progress").length;

  const activeTypes = getActiveChangeTypes(sortChangeTypes(changeTypes));

  const STATUS_STYLES: Record<string, { bg: string; dot: string }> = {
    submitted: { bg: "#dff4e9", dot: "#0f6d55" },
    accepted: { bg: "#e3eaf5", dot: "#28497c" },
    in_progress: { bg: "#fff3d6", dot: "#c8950c" },
    processed: { bg: "#e8f5e9", dot: "#2e7d32" },
    validated: { bg: "#dff4e9", dot: "#0a513f" },
  };

  return (
    <div className="page-shell home-shell">
      {/* Hero */}
      <section className="hero" role="region" aria-label="Introductie">
        <p className="eyebrow">BUSINESS CHANGE MANAGEMENT</p>
        <h1>Veranderingen direct<br />goed aanvragen.</h1>
        <p className="hero-copy">Van klantafspraak naar een compleet, controleerbaar change request voor administratie, asset servicing en performance.</p>
        <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
          <Link className="button button-primary" href="/benchmark-aanvraag">Nieuwe benchmark →</Link>
          <Link className="button button-secondary" href="/changes/new">Change aanvragen →</Link>
        </div>
      </section>

      {/* Stats grid */}
      <section className="status-grid" aria-label="Overzicht">
        <article className="stat-card" aria-label="Actieve klanten"><p>Actieve klanten</p><strong>{clientConfigs.length}</strong><span>Client config beschikbaar</span></article>
        <article className="stat-card" aria-label="Portefeuilles"><p>Portefeuilles</p><strong>{portfolioCount}</strong><span>Voorgeladen uit afspraken</span></article>
        <article className="stat-card" aria-label="Openstaande changes"><p>Openstaand</p><strong>{pendingCount}</strong><span>In behandeling</span></article>
        <article className="stat-card" aria-label="Totaal changes"><p>Totaal changes</p><strong>{changes.length}</strong><span><Link href="/changes">Bekijk overzicht →</Link></span></article>
      </section>

      {/* Change type catalog */}
      {activeTypes.length > 0 && (
        <section style={{ marginTop: 64 }} aria-label="Change catalogus">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 }}>
            <div>
              <p className="eyebrow">CHANGE CATALOGUS</p>
              <h2 style={{ fontSize: 28, letterSpacing: "-.04em", margin: 0 }}>Kies een wijziging</h2>
            </div>
            <Link href="/changes" className="button button-ghost" style={{ flexShrink: 0 }}>
              Alle changes →
            </Link>
          </div>
          <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4, maxWidth: 600 }}>
            Selecteer het type wijziging dat je wilt doorvoeren. BCM leidt je stap voor stap door de aanvraag.
          </p>
          <ChangeTypeCatalog types={activeTypes} />
        </section>
      )}

      {/* Recent changes */}
      {recentChanges.length > 0 && (
        <section className="workflow-card" aria-label="Recente changes" style={{ marginTop: 56 }}>
          <div>
            <p className="eyebrow">RECENTE CHANGES</p>
            <h2>Laatste wijzigingen</h2>
          </div>
          <div style={{ width: "100%", marginTop: 16 }}>
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

      {/* About section */}
      <section className="workflow-card alt" style={{ marginTop: 56 }} aria-label="Over BCM">
        <div>
          <p className="eyebrow">OVER BCM</p>
          <h2>Rapportages en inzichten</h2>
          <p>Bekijk doorlooptijden, kostenoverzichten en volume per klant in het rapportagedashboard.</p>
        </div>
        <div className="use-case-actions">
          <Link className="button button-secondary" href="/reports">Rapportages →</Link>
        </div>
      </section>
    </div>
  );
}
