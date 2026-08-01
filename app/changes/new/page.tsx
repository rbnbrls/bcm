import { GenericChangeForm } from "@/components/generic-change-form";
import { PortfolioAdditionForm } from "@/components/portfolio-addition-form";
import { AssetClassRequestForm } from "@/components/asset-class-request-form";
import { SubAssetClassRequestForm } from "@/components/sub-asset-class-request-form";
import { ClientOnboardingWizard } from "@/components/client-onboarding-wizard";
import { getClientConfigs, getChangeTypes, getBenchmarks } from "@/lib/db";
import { getClientConfigReferenceData } from "@/lib/client-config-db";

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

  // Route the change type to its intended form via the catalog
  const formKind = resolveChangeTypeFormKind(preselectedType);

  let portfolioFormData: Awaited<ReturnType<typeof loadPortfolioFormData>> | null = null;
  let lookupFormData: Awaited<ReturnType<typeof loadLookupFormData>> | null = null;
  let onboardingAssetClasses: Awaited<ReturnType<typeof getClientConfigReferenceData>>["assetClasses"] = [];
  if (formKind === "portfolio-create") {
    portfolioFormData = await loadPortfolioFormData();
  }
  if (showAssetClassForm || showSubAssetClassForm) {
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
      {formKind === "client-onboarding" ? (
        <ClientOnboardingWizard assetClasses={onboardingAssetClasses} />
      ) : formKind === "portfolio-create" && portfolioFormData ? (
        <PortfolioAdditionForm
          changeTypeSlug={preselectedType ?? "portfolio_addition"}
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
