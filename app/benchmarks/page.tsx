import { getBenchmarks } from "@/lib/db";
import BenchmarkCatalogTable from "./benchmark-catalog-table";

export default async function BenchmarkCatalogPage() {
  const benchmarks = await getBenchmarks();

  return (
    <div className="page-shell config-shell">
      <div className="page-intro">
        <div>
          <p className="eyebrow">CATALOGUS</p>
          <h1>Benchmark catalogus</h1>
          <p>Alle beschikbare benchmarks met kosten en doorlooptijd per leverancier. Gebruik de tabel als screener om de juiste benchmark te selecteren.</p>
        </div>
        <div className="standard-note">
          <b>Screener</b>
          <span>Short name · Long name · Asset class · Kosten · Leverancier</span>
        </div>
      </div>

      <BenchmarkCatalogTable benchmarks={benchmarks} />

      <section className="cost-summary">
        <p className="eyebrow">KOSTEN & DOORLOOPTIJD</p>
        <h2>Overzicht per change type</h2>
        <div className="cost-grid">
          <article className="cost-card">
            <p className="cost-card-type">Benchmarkwissel</p>
            <p className="cost-card-detail">Bestaande benchmark kiezen</p>
            <div className="cost-card-meta">
              <span><b>Doorlooptijd</b> 1 week</span>
              <span><b>Kosten</b> € {benchmarks[0]?.cost.toLocaleString("nl-NL") ?? "1.000"} (benchmark)</span>
            </div>
          </article>
          <article className="cost-card">
            <p className="cost-card-type">Benchmarkwissel + nieuw</p>
            <p className="cost-card-detail">Nieuwe benchmark aanvragen via wissel</p>
            <div className="cost-card-meta">
              <span><b>Doorlooptijd</b> 1 week + 4 weken = 5 weken</span>
              <span><b>Kosten</b> benchmark + € 5.000</span>
            </div>
          </article>
          <article className="cost-card">
            <p className="cost-card-type">Nieuwe benchmark</p>
            <p className="cost-card-detail">Aparte aanvraag voor nieuwe benchmark</p>
            <div className="cost-card-meta">
              <span><b>Doorlooptijd</b> 4 weken</span>
              <span><b>Kosten</b> € 5.000</span>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
