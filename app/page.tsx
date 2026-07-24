import Link from "next/link";
import { getClientConfigs } from "@/lib/db";

export default async function HomePage() {
  const clientConfigs = await getClientConfigs();
  const portfolioCount = clientConfigs.reduce((count, client) => count + client.portfolios.length, 0);
  return (
    <div className="page-shell home-shell">
      <section className="hero">
        <p className="eyebrow">BUSINESS CHANGE MANAGEMENT</p>
        <h1>Veranderingen direct<br />goed aanvragen.</h1>
        <p className="hero-copy">Van klantafspraak naar een compleet, controleerbaar change request voor administratie, asset servicing en performance.</p>
        <Link className="button button-primary" href="/changes/new">Start benchmarkwissel <span>→</span></Link>
      </section>
      <section className="status-grid" aria-label="Overzicht">
        <article className="stat-card"><p>Actieve klanten</p><strong>{clientConfigs.length}</strong><span>Client config beschikbaar</span></article>
        <article className="stat-card"><p>Portefeuilles</p><strong>{portfolioCount}</strong><span>Voorgeladen uit afspraken</span></article>
        <article className="stat-card"><p>Change type</p><strong>01</strong><span>Benchmarkwissel</span></article>
      </section>
      <section className="workflow-card">
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
    </div>
  );
}
