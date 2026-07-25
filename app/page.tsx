import Link from "next/link";
import { getClientConfigs } from "@/lib/db";

export default async function HomePage() {
  const clientConfigs = await getClientConfigs();
  const portfolioCount = clientConfigs.reduce((count, client) => count + client.portfolios.length, 0);
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
        <article className="stat-card" aria-label="Change type"><p>Change type</p><strong>01</strong><span>Benchmarkwissel</span></article>
      </section>
      <section className="workflow-card" aria-label="Benchmarkwissel use case">
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
