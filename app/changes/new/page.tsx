import { BenchmarkChangeForm } from "@/components/benchmark-change-form";
import { getBenchmarks, getClientConfigs } from "@/lib/db";

export default async function NewBenchmarkChangePage() {
  const [clients, benchmarkCatalog] = await Promise.all([getClientConfigs(), getBenchmarks()]);
  return (
    <div className="page-shell request-shell">
      <div className="page-intro">
        <div><p className="eyebrow">CHANGE REQUEST · 01</p><h1>Benchmarkwissel</h1><p>Leg de gewenste benchmark per portefeuille vast. De huidige afspraak komt uit de client config.</p></div>
        <div className="standard-note"><b>First time right</b><span>Verplichte informatie wordt gevalideerd vóór verzending.</span></div>
      </div>
      <BenchmarkChangeForm clients={clients} benchmarks={benchmarkCatalog} />
    </div>
  );
}
