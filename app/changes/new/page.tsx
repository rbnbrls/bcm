import { GenericChangeForm } from "@/components/generic-change-form";
import { BenchmarkChangeForm } from "@/components/benchmark-change-form";
import { PortfolioAdditionForm } from "@/components/portfolio-addition-form";
import { AssetClassRequestForm } from "@/components/asset-class-request-form";
import { SubAssetClassRequestForm } from "@/components/sub-asset-class-request-form";
import { ClientOnboardingSubmit } from "./client-onboarding-submit";
import { getClientConfigs, getChangeTypes, getBenchmarks, getChangeTypeBySlug } from "@/lib/db";
import { getBenchmarkSwitchPortfolioOptions, getClientConfigReferenceData } from "@/lib/client-config-db";
import { resolveChangeTypeFormKind } from "@/lib/change-type-catalog";
import { getMinimumDate } from "@/lib/change-form-utils";

type Props = {
  searchParams?: Promise<{ type?: string }>;
};

export default async function NewChangeRequestPage({ searchParams }: Props) {
  let clients: Awaited<ReturnType<typeof getClientConfigs>> = [] as Awaited<ReturnType<typeof getClientConfigs>>;
  let changeTypes: Awaited<ReturnType<typeof getChangeTypes>> = [] as Awaited<ReturnType<typeof getChangeTypes>>;
  let benchmarks: Awaited<ReturnType<typeof getBenchmarks>> = [] as Awaited<ReturnType<typeof getBenchmarks>>;

  try {
    changeTypes = await getChangeTypes();
  } catch {
    // In test environments without a database, fall back to empty data so the page still renders.
  }

  let preselectedType: string | undefined;
  const params = searchParams ? await searchParams : undefined;
  if (params?.type) {
    try {
      // Route explicit deep links on the full change type config, not on
      // catalog visibility: e53c669 restricts the visible catalog (and the
      // DB `active` flag) to benchmark_switch, but the wizard flows
      // (client_onboarding, portfolio_configuration_*, ...) are still
      // implemented and exercised by the @db e2e specs via direct URLs.
      const config = await getChangeTypeBySlug(params.type);
      if (config) preselectedType = config.slug;
    } catch {
      // Unknown/inactive types fall back to the benchmark landing below.
    }
  }
  const formKind = resolveChangeTypeFormKind(preselectedType);

  // The benchmark switch is the default landing flow: the bare /changes/new
  // link (dashboard, 404 page) opens it, and unknown/inactive ?type= values
  // fall back to it too. Explicit active type params (change-type cards and
  // deep links) route to their dedicated or config-driven form below.
  const isBenchmarkLanding = preselectedType === undefined || preselectedType === "benchmark_switch";

  let portfolioFormData: Awaited<ReturnType<typeof loadPortfolioFormData>> | null = null;
  let benchmarkFormData: Awaited<ReturnType<typeof loadBenchmarkFormData>> | null = null;
  let lookupFormData: Awaited<ReturnType<typeof loadLookupFormData>> | null = null;
  let onboardingAssetClasses: Awaited<ReturnType<typeof getClientConfigReferenceData>>["assetClasses"] = [];
  if (isBenchmarkLanding) {
    benchmarkFormData = await loadBenchmarkFormData();
  } else if (formKind === "portfolio-create") {
    portfolioFormData = await loadPortfolioFormData();
  }
  if (
    !isBenchmarkLanding &&
    (formKind === "generic" || formKind === "asset-class-request" || formKind === "sub-asset-class-request")
  ) {
    try {
      clients = await getClientConfigs();
    } catch {
      clients = [];
    }
  }
  if (!isBenchmarkLanding && formKind === "generic") {
    try {
      benchmarks = await getBenchmarks();
    } catch {
      benchmarks = [];
    }
  }
  if (formKind === "asset-class-request" || formKind === "sub-asset-class-request") {
    lookupFormData = await loadLookupFormData();
  }
  if (formKind === "client-onboarding") {
    const referenceData = await getClientConfigReferenceData();
    onboardingAssetClasses = referenceData.assetClasses;
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
      {isBenchmarkLanding && benchmarkFormData ? (
        <BenchmarkChangeForm
          clients={benchmarkFormData.clients}
          portfolioOptions={benchmarkFormData.portfolioOptions}
          benchmarks={benchmarkFormData.benchmarks}
          minimumEffectiveDate={benchmarkFormData.minimumEffectiveDate}
          leadDays={benchmarkFormData.leadDays}
        />
      ) : formKind === "client-onboarding" ? (
        <ClientOnboardingSubmit assetClasses={onboardingAssetClasses} />
      ) : formKind === "portfolio-create" && portfolioFormData ? (
        <PortfolioAdditionForm
          changeTypeSlug={preselectedType ?? "portfolio_addition"}
          clients={portfolioFormData.clients}
          portfolios={portfolioFormData.portfolios}
          requireClient={preselectedType === "portfolio_configuration_create"}
          benchmarks={portfolioFormData.benchmarks}
          assetClasses={portfolioFormData.assetClasses}
          subAssetClasses={portfolioFormData.subAssetClasses}
          managers={portfolioFormData.managers}
          npcClassifications={portfolioFormData.npcClassifications}
        />
      ) : formKind === "asset-class-request" && lookupFormData ? (
        <AssetClassRequestForm clients={clients} />
      ) : formKind === "sub-asset-class-request" && lookupFormData ? (
        <SubAssetClassRequestForm clients={clients} assetClasses={lookupFormData.assetClasses} />
      ) : (
        <GenericChangeForm clients={clients} changeTypes={changeTypes} benchmarks={benchmarks} preselectedType={preselectedType} />
      )}
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

async function loadPortfolioFormData() {
  const referenceData = await getClientConfigReferenceData();
  return {
    clients: referenceData.clients,
    portfolios: referenceData.portfolios,
    benchmarks: referenceData.benchmarks,
    assetClasses: referenceData.assetClasses,
    subAssetClasses: referenceData.subAssetClasses,
    managers: referenceData.managers,
    npcClassifications: referenceData.npcClassifications,
  };
}

async function loadLookupFormData() {
  const referenceData = await getClientConfigReferenceData();
  return {
    assetClasses: referenceData.assetClasses,
  };
}
