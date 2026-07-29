import { getBenchmarks } from "@/lib/db";
import { getClientConfigPortfolioConfigurations } from "@/lib/client-config-db";
import ClientConfigTable from "./client-config-table";

export default async function ClientConfigPage() {
  const rows = await getClientConfigPortfolioConfigurations();
  const benchmarks = await getBenchmarks();

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
      <ClientConfigTable rows={rows} />
      <section className="catalog-section">
        <div>
          <p className="eyebrow">CATALOGUS</p>
          <h2>Beschikbare benchmarks</h2>
          <p className="catalog-subtitle">Open de <a href="/benchmarks" style={{ color: "var(--accent)", textDecoration: "underline" }}>volledige catalogus</a> voor kosten, doorlooptijd en leveranciersinformatie.</p>
        </div>
        <div className="catalog-list">
          {benchmarks.map((benchmark) => (
            <div key={benchmark.id}>
              <b>{benchmark.code}</b>
              <span>{benchmark.name}</span>
              <small>{benchmark.assetClass} · {benchmark.currency} · € {benchmark.cost.toLocaleString("nl-NL")} · {benchmark.provider}</small>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
