import { GenericChangeForm } from "@/components/generic-change-form";
import { PortfolioAdditionForm } from "@/components/portfolio-addition-form";
import { AssetClassRequestForm } from "@/components/asset-class-request-form";
import { SubAssetClassRequestForm } from "@/components/sub-asset-class-request-form";
import { ClientOnboardingWizard } from "@/components/client-onboarding-wizard";
import { getClientConfigs, getChangeTypes, getBenchmarks } from "@/lib/db";
import { getClientConfigReferenceData } from "@/lib/client-config-db";
import { resolveChangeTypeFormKind } from "@/lib/change-type-catalog";

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

  // If portfolio_addition is selected, show the normalized 4-step wizard
  const showPortfolioForm = preselectedType === "portfolio_addition";
  // Lookup-addition change types render their dedicated request forms
  const showAssetClassForm = preselectedType === "new_asset_class";
  const showSubAssetClassForm = preselectedType === "new_sub_asset_class";
  // Client onboarding wizard (new pension fund + first portfolio configuration)
  const showClientOnboardingWizard = preselectedType === "client_onboarding";

  let portfolioFormData: Awaited<ReturnType<typeof loadPortfolioFormData>> | null = null;
  let lookupFormData: Awaited<ReturnType<typeof loadLookupFormData>> | null = null;
  let onboardingAssetClasses: Awaited<ReturnType<typeof getClientConfigReferenceData>>["assetClasses"] = [];
  if (showPortfolioForm) {
    portfolioFormData = await loadPortfolioFormData();
  }
  if (showAssetClassForm || showSubAssetClassForm) {
    lookupFormData = await loadLookupFormData();
  }
  if (showClientOnboardingWizard) {
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
      {showClientOnboardingWizard ? (
        <ClientOnboardingWizard assetClasses={onboardingAssetClasses} />
      ) : showPortfolioForm && portfolioFormData ? (
        <PortfolioAdditionForm
          clients={clients}
          benchmarks={portfolioFormData.benchmarks}
          assetClasses={portfolioFormData.assetClasses}
          subAssetClasses={portfolioFormData.subAssetClasses}
          managers={portfolioFormData.managers}
          npcClassifications={portfolioFormData.npcClassifications}
        />
      ) : showAssetClassForm && lookupFormData ? (
        <AssetClassRequestForm clients={clients} />
      ) : showSubAssetClassForm && lookupFormData ? (
        <SubAssetClassRequestForm clients={clients} assetClasses={lookupFormData.assetClasses} />
      ) : (
        <GenericChangeForm clients={clients} changeTypes={changeTypes} benchmarks={benchmarks} preselectedType={preselectedType} />
      )}
    </div>
  );
}

async function loadPortfolioFormData() {
  const referenceData = await getClientConfigReferenceData();
  return {
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
