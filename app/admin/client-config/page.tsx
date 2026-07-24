import { getBenchmarks, getClientConfigs } from "@/lib/db";
import ClientConfigTable from "./client-config-table";

export default async function ClientConfigPage() {
  const [clients, benchmarks] = await Promise.all([getClientConfigs(), getBenchmarks()]);

  const rows = clients.flatMap((client) =>
    client.portfolios.map((portfolio) => ({
      clientName: client.name,
      clientReference: client.externalReference,
      portfolioName: portfolio.name,
      benchmarkCode: portfolio.currentBenchmark.code,
      benchmarkName: portfolio.currentBenchmark.name,
      portfolioReference: portfolio.externalReference,
    }))
  );

  return (
    <div className="page-shell config-shell">
      <div className="page-intro">
        <div>
          <p className="eyebrow">BRONREGISTRATIE</p>
          <h1>Client config</h1>
          <p>De operationele afspraken die een change vooraf invullen. In productie wordt deze bron gevoed vanuit CRM, catalogus, tarieven, facturatie en klantrapportage.</p>
        </div>
        <div className="standard-note">
          <b>Configuratiebron</b>
          <span>Per klant, portefeuille en benchmark.</span>
        </div>
      </div>
      <ClientConfigTable rows={rows} />
      <section className="catalog-section">
        <div>
          <p className="eyebrow">CATALOGUS</p>
          <h2>Beschikbare benchmarks</h2>
        </div>
        <div className="catalog-list">
          {benchmarks.map((benchmark) => (
            <div key={benchmark.id}>
              <b>{benchmark.code}</b>
              <span>{benchmark.name}</span>
              <small>{benchmark.assetClass} · {benchmark.currency}</small>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
