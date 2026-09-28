import type { ApplyStrategy } from "@/lib/change-types/templates";
import type { ProcessChangeResult } from "@/lib/change-processing-types";
import type { ChangeTypeRegistration } from "@/lib/change-type-registry";
import { captureError } from "@/lib/sentry-helper";

type ApplyStrategyContext = {
  changeRequestId: string;
  changeType: string;
  registration: ChangeTypeRegistration;
};

type ApplyStrategyHandler = (context: ApplyStrategyContext) => Promise<ProcessChangeResult>;

function baseResult(context: ApplyStrategyContext): Pick<ProcessChangeResult, "changeRequestId" | "changeType"> {
  return {
    changeRequestId: context.changeRequestId,
    changeType: context.changeType,
  };
}

async function withApplyError(
  context: ApplyStrategyContext,
  phase: string,
  stagedRows: number,
  usedLegacy: boolean,
  fn: () => Promise<ProcessChangeResult>,
): Promise<ProcessChangeResult> {
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende fout";
    captureError(error, { endpoint: "processChangeForProcessedStatus", phase });
    return {
      ...baseResult(context),
      stagedRows,
      applied: false,
      outcomes: [],
      usedLegacy,
      error: message,
    };
  }
}

async function applyStagedClientOnboarding(context: ApplyStrategyContext): Promise<ProcessChangeResult> {
  const { getClientOnboardingStagingByChangeRequestId, applyClientOnboardingStaging } = await import(
    "@/lib/onboarding-staging-db"
  );
  const stagedOnboarding = await getClientOnboardingStagingByChangeRequestId(context.changeRequestId);
  if (!stagedOnboarding) {
    return {
      ...baseResult(context),
      stagedRows: 0,
      applied: false,
      outcomes: [],
      usedLegacy: false,
      error: "Geen staged client onboarding gevonden voor deze change.",
    };
  }

  return withApplyError(context, "apply_onboarding", 1, false, async () => {
    const result = await applyClientOnboardingStaging(context.changeRequestId);
    return {
      ...baseResult(context),
      stagedRows: 1,
      applied: result.success,
      outcomes: result.applied,
      usedLegacy: false,
      error: result.error,
    };
  });
}

export async function applyStagedMetadata(context: ApplyStrategyContext): Promise<ProcessChangeResult> {
  const { getChangePortfolioMetadataRequests, applyChangePortfolioMetadataRequests } = await import(
    "@/lib/client-config-db"
  );
  const stagedMetadata = await getChangePortfolioMetadataRequests(context.changeRequestId);
  if (stagedMetadata.length === 0) {
    return {
      ...baseResult(context),
      stagedRows: 0,
      applied: false,
      outcomes: [],
      usedLegacy: false,
      error: "Geen staged portfolio metadata gevonden voor deze change.",
    };
  }

  return withApplyError(context, "apply_metadata", stagedMetadata.length, false, async () => {
    const result = await applyChangePortfolioMetadataRequests(context.changeRequestId);
    return {
      ...baseResult(context),
      stagedRows: stagedMetadata.length,
      applied: result.success,
      outcomes: result.applied,
      usedLegacy: false,
      error: result.error,
    };
  });
}

async function applyStagedLookup(context: ApplyStrategyContext): Promise<ProcessChangeResult> {
  const { getChangeLookupRequests, applyChangeLookupRequests } = await import("@/lib/client-config-db");
  const stagedLookups = await getChangeLookupRequests(context.changeRequestId);
  if (stagedLookups.length === 0) {
    return {
      ...baseResult(context),
      stagedRows: 0,
      applied: false,
      outcomes: [],
      usedLegacy: false,
      error: "Geen staged lookup aanvraag gevonden voor deze change.",
    };
  }

  return withApplyError(context, "apply_lookup", stagedLookups.length, false, async () => {
    const result = await applyChangeLookupRequests(context.changeRequestId);
    return {
      ...baseResult(context),
      stagedRows: stagedLookups.length,
      applied: result.success,
      outcomes: result.applied,
      usedLegacy: false,
      error: result.error,
    };
  });
}

async function applyNewBenchmarkRequest(context: ApplyStrategyContext): Promise<ProcessChangeResult> {
  return withApplyError(context, "apply_new_benchmark", 0, false, async () => {
    const { applyNewBenchmarkRequest: applyRequest } = await import("@/lib/client-config-db");
    const result = await applyRequest(context.changeRequestId);
    return {
      ...baseResult(context),
      stagedRows: result.applied.length,
      applied: result.success,
      outcomes: result.applied,
      usedLegacy: false,
      error: result.error,
    };
  });
}

async function applyStagedPortfolioConfiguration(context: ApplyStrategyContext): Promise<ProcessChangeResult> {
  const { getChangePortfolioConfigurations, applyChangePortfolioConfigurations } = await import(
    "@/lib/client-config-db"
  );
  const staged = await getChangePortfolioConfigurations(context.changeRequestId);
  if (staged.length > 0) {
    return withApplyError(context, "apply_3nf", staged.length, false, async () => {
      const result = await applyChangePortfolioConfigurations(context.changeRequestId);
      return {
        ...baseResult(context),
        stagedRows: staged.length,
        applied: result.success,
        outcomes: result.applied,
        usedLegacy: false,
        error: result.error,
      };
    });
  }

  if (context.changeType !== "portfolio_addition") {
    return {
      ...baseResult(context),
      stagedRows: 0,
      applied: false,
      outcomes: [],
      usedLegacy: false,
      error: "Geen staged portefeuilleconfiguratie gevonden voor deze change.",
    };
  }

  return withApplyError(context, "apply_legacy", 0, true, async () => {
    const { createPortfolioFromChangeAction } = await import("@/lib/db");
    const result = await createPortfolioFromChangeAction(context.changeRequestId);
    return {
      ...baseResult(context),
      stagedRows: 0,
      applied: result.success,
      outcomes: result.portfolioId
        ? [
            {
              actionType: "CREATE",
              primaryAccountId: result.portfolioId,
              result: result.success ? "applied" : "failed",
              error: result.error,
            },
          ]
        : [],
      usedLegacy: true,
      error: result.error,
    };
  });
}

async function applyIstSync(context: ApplyStrategyContext): Promise<ProcessChangeResult> {
  return withApplyError(context, "ist_sync", 0, true, async () => {
    const { istSyncOnProcessed } = await import("@/lib/db");
    await istSyncOnProcessed(context.changeRequestId);
    return {
      ...baseResult(context),
      stagedRows: 0,
      applied: true,
      outcomes: [],
      usedLegacy: true,
    };
  });
}

export const applyStrategies: Record<ApplyStrategy, ApplyStrategyHandler> = {
  ist_sync: applyIstSync,
  staged_lookup: applyStagedLookup,
  staged_metadata: applyStagedMetadata,
  staged_portfolio_configuration: applyStagedPortfolioConfiguration,
  staged_client_onboarding: applyStagedClientOnboarding,
  new_benchmark_request: applyNewBenchmarkRequest,
};

export function getApplyStrategy(strategy: ApplyStrategy): ApplyStrategyHandler {
  return applyStrategies[strategy];
}

