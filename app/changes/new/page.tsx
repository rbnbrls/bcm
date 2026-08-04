import { BenchmarkChangeForm } from "@/components/benchmark-change-form";
import { getBenchmarkSwitchPortfolioOptions, getClientConfigReferenceData } from "@/lib/client-config-db";
import { getMinimumDate } from "@/lib/change-form-utils";
import { getChangeTypeBySlug } from "@/lib/db";

type Props = {
  searchParams?: Promise<{ type?: string }>;
};

export default async function NewChangeRequestPage({ searchParams }: Props) {
  // Deliberately consume searchParams so old links with ?type=... keep loading
  // this page, while the frontend only exposes the benchmark switch process.
  if (searchParams) await searchParams;
  const benchmarkFormData = await loadBenchmarkFormData();

  return (
    <div className="page-shell request-shell">
      <div className="page-intro">
        <div>
          <p className="eyebrow">CHANGE REQUEST</p>
          <h1>Benchmarkwissel aanvragen</h1>
          <p>Selecteer een actieve regel uit client_config en kies alleen de nieuwe benchmark. De wijziging wordt na akkoord doorgevoerd op dezelfde portefeuilleconfiguratie.</p>
        </div>
        <div className="standard-note">
          <b>Bron: client_config</b>
          <span>Alleen bestaande actieve regels uit de client-config tabel zijn beschikbaar.</span>
        </div>
      </div>
      <BenchmarkChangeForm
        clients={benchmarkFormData.clients}
        portfolioOptions={benchmarkFormData.portfolioOptions}
        benchmarks={benchmarkFormData.benchmarks}
        minimumEffectiveDate={benchmarkFormData.minimumEffectiveDate}
        leadDays={benchmarkFormData.leadDays}
      />
    </div>
  );
}

async function loadBenchmarkFormData() {
  const [referenceData, portfolioOptions, changeTypeConfig] = await Promise.all([
    getClientConfigReferenceData(),
    getBenchmarkSwitchPortfolioOptions(),
    getChangeTypeBySlug("benchmark_switch"),
  ]);
  const leadDays = changeTypeConfig?.defaultLeadDays ?? 0;
  return {
    clients: referenceData.clients,
    portfolioOptions,
    benchmarks: referenceData.benchmarks,
    leadDays,
    minimumEffectiveDate: getMinimumDate(leadDays),
  };
}
