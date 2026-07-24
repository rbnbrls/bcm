import { getBenchmarks, getClientConfigs } from "@/lib/db";

export default async function ClientConfigPage() {
  const [clients, benchmarks] = await Promise.all([getClientConfigs(), getBenchmarks()]);
  return <div className="page-shell config-shell"><div className="page-intro"><div><p className="eyebrow">BRONREGISTRATIE</p><h1>Client config</h1><p>De operationele afspraken die een change vooraf invullen. In productie wordt deze bron gevoed vanuit CRM, catalogus, tarieven, facturatie en klantrapportage.</p></div><div className="standard-note"><b>Configuratiebron</b><span>Per klant, portefeuille en benchmark.</span></div></div>
    <section className="config-table-wrap"><table className="config-table"><thead><tr><th>Klant</th><th>Portefeuille</th><th>Huidige benchmark</th><th>Referentie</th></tr></thead><tbody>{clients.flatMap((client) => client.portfolios.map((portfolio) => <tr key={portfolio.id}><td><b>{client.name}</b><small>{client.externalReference}</small></td><td>{portfolio.name}</td><td><b>{portfolio.currentBenchmark.code}</b><small>{portfolio.currentBenchmark.name}</small></td><td>{portfolio.externalReference}</td></tr>))}</tbody></table></section>
    <section className="catalog-section"><div><p className="eyebrow">CATALOGUS</p><h2>Beschikbare benchmarks</h2></div><div className="catalog-list">{benchmarks.map((benchmark) => <div key={benchmark.id}><b>{benchmark.code}</b><span>{benchmark.name}</span><small>{benchmark.assetClass} · {benchmark.currency}</small></div>)}</div></section>
  </div>;
}
