import { GenericChangeForm } from "@/components/generic-change-form";
import { PortfolioAdditionForm } from "@/components/portfolio-addition-form";
import { getClientConfigs, getChangeTypes, getBenchmarks, getWtpClassifications, getAssetClassRows, getManagers, getBenchmarkGroups } from "@/lib/db";
import { sortChangeTypes, getActiveChangeTypes } from "@/lib/change-type-catalog";

type Props = {
  searchParams?: Promise<{ type?: string }>;
};

export default async function NewChangeRequestPage({ searchParams }: Props) {
  let clients: Awaited<ReturnType<typeof getClientConfigs>> = [] as Awaited<ReturnType<typeof getClientConfigs>>;
  let changeTypes: Awaited<ReturnType<typeof getChangeTypes>> = [] as Awaited<ReturnType<typeof getChangeTypes>>;
  let benchmarks: Awaited<ReturnType<typeof getBenchmarks>> = [] as Awaited<ReturnType<typeof getBenchmarks>>;

  try {
    [clients, changeTypes, benchmarks] = await Promise.all([
      getClientConfigs(),
      getChangeTypes(),
      getBenchmarks(),
    ]);
  } catch {
    // In test environments without a database, fall back to empty data so the page still renders.
  }

  let preselectedType: string | undefined;
  const params = searchParams ? await searchParams : undefined;
  if (params?.type) {
    const matching = changeTypes.find((ct) => ct.slug === params.type && ct.active);
    if (matching) preselectedType = matching.slug;
  }

  // If portfolio_addition is selected, show the custom 4-step wizard
  const showPortfolioForm = preselectedType === "portfolio_addition";

  let portfolioFormData: Awaited<ReturnType<typeof loadPortfolioFormData>> | null = null;
  if (showPortfolioForm) {
    portfolioFormData = await loadPortfolioFormData();
  }

  return (
    <div className="page-shell request-shell">
      <div className="page-intro">
        <div>
          <p className="eyebrow">CHANGE REQUEST</p>
          <h1>Nieuwe change</h1>
          <p>Kies een change type en vul de benodigde gegevens in. Hetzelfde 4-stappenpatroon voor elk type wijziging.</p>
        </div>
        <div className="standard-note">
          <b>First time right</b>
          <span>Verplichte informatie wordt gevalideerd vóór verzending.</span>
        </div>
      </div>
      {showPortfolioForm && portfolioFormData ? (
        <PortfolioAdditionForm
          clients={clients}
          benchmarks={portfolioFormData.benchmarks}
          wtpClassifications={portfolioFormData.wtpClassifications}
          assetClassRows={portfolioFormData.assetClassRows}
          managers={portfolioFormData.managers}
          benchmarkGroups={portfolioFormData.benchmarkGroups}
        />
      ) : (
        <GenericChangeForm clients={clients} changeTypes={changeTypes} benchmarks={benchmarks} preselectedType={preselectedType} />
      )}
    </div>
  );
}

async function loadPortfolioFormData() {
  const [benchmarks, wtpClassifications, assetClassRows, managers, benchmarkGroups] = await Promise.all([
    getBenchmarks(),
    getWtpClassifications(),
    getAssetClassRows(),
    getManagers(),
    getBenchmarkGroups(),
  ]);
  return { benchmarks, wtpClassifications, assetClassRows, managers, benchmarkGroups };
}
