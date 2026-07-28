import { getClientConfigs, getBenchmarks } from "@/lib/db";
import ClientConfigTable from "./client-config-table";

export default async function ClientConfigPage() {
  const clients = await getClientConfigs();

  const rows = clients.flatMap((client) =>
    client.portfolios.map((portfolio) => ({
      clientName: client.name,
      clientReference: client.externalReference,
      portfolioName: portfolio.name,
      benchmarkCode: portfolio.currentBenchmark.code,
      benchmarkName: portfolio.currentBenchmark.name,
      portfolioReference: portfolio.externalReference,
      portfolioId: portfolio.id,
      assetClass: client.assetClass ?? null,
      portfolioAssetClass: portfolio.assetClass,
      portfolioSubAssetClass: portfolio.subAssetClass,
      wtpClassificationId: portfolio.wtpClassificationId,
      wtpClassificationName: portfolio.wtpClassification.name,
      assetClassRowId: portfolio.assetClassId,
      assetClassRowName: portfolio.assetClassRow.name,
      managerId: portfolio.managerId,
      managerName: portfolio.manager.name,
      benchmarkGroupId: portfolio.benchmarkId,
      benchmarkGroupName: portfolio.benchmarkGroup.name,
    }))
  );

  // Get benchmarks for the catalog section
  const benchmarks = await getBenchmarks();

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
      <ClientConfigTable
        rows={rows}
      />
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
