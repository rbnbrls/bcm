import Link from "next/link";
import { getClientConfigPortfolioConfigurations, getClientConfigReferenceData } from "@/lib/client-config-db";
import ClientConfigTable from "./client-config-table";

export default async function ClientConfigPage() {
  const rows = await getClientConfigPortfolioConfigurations();
  const { benchmarks } = await getClientConfigReferenceData();

  return (
    <div className="page-shell config-shell">
      <div className="page-intro">
        <div>
          <p className="eyebrow">BRONREGISTRATIE</p>
          <h1>Client config</h1>
          <p>Genormaliseerde client configuration: één rij per primary account, met propere relaties naar asset class, sub asset class, manager, benchmark en NPC classificatie.</p>
        </div>
        <div className="standard-note">
          <b>Configuratiebron</b>
          <span>Per primary account, portefeuille en benchmark.</span>
        </div>
      </div>
      <div className="bottom-actions" style={{ justifyContent: "flex-start", marginBottom: 18, marginTop: -24 }}>
        <Link className="button button-secondary" href="/admin/client-config/data-catalog">
          Data catalogus
        </Link>
      </div>
      <ClientConfigTable rows={rows} />
      <section className="catalog-section">
        <div>
          <p className="eyebrow">CATALOGUS</p>
          <h2>Beschikbare benchmarks</h2>
          <p className="catalog-subtitle">Kosten, doorlooptijd en leveranciersinformatie per change type staan in de <Link href="/change-catalog" style={{ color: "var(--accent)", textDecoration: "underline" }}>change catalogus</Link>.</p>
        </div>
        <div className="catalog-list">
          {benchmarks.map((benchmark) => (
            <div key={benchmark.benchmarkId}>
              <b>{benchmark.benchmarkCode}</b>
              <span>{benchmark.benchmarkName ?? "Naam ontbreekt"}</span>
              <small>{benchmark.rimesCode ?? "Geen Rimes code"}</small>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
