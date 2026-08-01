"use server";

import { randomUUID } from "crypto";
import { z } from "zod";
import { redirect } from "next/navigation";
import {
  getChangeTypeBySlug,
  saveChangeRequest,
  getChangeRequest,
} from "@/lib/db";
import { getClientConfigPortfolioConfigurations, stageChangePortfolioConfiguration } from "@/lib/client-config-db";
import { validatePortfolioFields } from "@/lib/portfolio-validation";
import {
  validateChangePortfolioConfiguration,
  type ChangeActionType,
} from "@/lib/validation-rules";
import { captureError } from "@/lib/sentry-helper";
import { reportError } from "@/lib/error-reporter";
import { generateReference, getTodayDateString } from "@/lib/change-form-utils";
import { resolveChangeTypeSlugWithFallback } from "@/lib/change-type-resolution";

// ─────────────────────────────────────────────────────────────────────────
// IMPORTANT
// ─────────────────────────────────────────────────────────────────────────
// The admin client-config page is the operator-facing read view. All
// configuration MUTATIONS must go through the BCM change-management
// workflow so that:
//   1. Stakeholders can review and approve the change.
//   2. The change is auditable (who requested, when, why, what).
//   3. Direct writes to client_config tables are not possible from this
//      surface (and from the broader app — see lib/client-config-db.ts).
//
// Each mutation server action below creates a change request and stages
// the corresponding row in client_config.change_portfolio_configuration.
// The actual write to portfolio_configuration happens later, when the
// change transitions to 'processed' (via lib/change-processor.ts).
// ─────────────────────────────────────────────────────────────────────────

export type UpdateAssetClassState = {
  success?: boolean;
  error?: string;
  changeRequestId?: string;
  issues?: string[];
};

const clientConfigEditSchema = z.object({
  primaryAccountId: z.string().min(1, "primaryAccountId is verplicht."),
  rationale: z.string().trim().min(10, "Licht de reden van de wijziging in minimaal 10 tekens toe."),
  requestedBy: z.string().trim().min(2, "Vul de naam van de aanvrager in."),
  effectiveDate: z.string().date("Kies een geldige ingangsdatum."),
});

/**
 * Generic helper used by every mutation server action below:
 *   - look up the existing portfolio_configuration row
 *   - run the business validation rules
 *   - create a change request and stage a change_portfolio_configuration row
 *   - redirect the operator to the change detail page
 */
async function dispatchClientConfigChange(args: {
  primaryAccountId: string;
  changeTypeSlug: string;
  actionType: "CREATE" | "UPDATE" | "DELETE";
  rationale: string;
  requestedBy: string;
  effectiveDate: string;
  fieldOverrides?: Partial<{
    longName: string;
    shortName: string;
    assetClassCode: string;
    subAssetClassCode: string;
    managerCode: string;
    benchmarkCode: string;
    npcClassificationId: number;
    portfolioCode: string;
    clientCode: string;
  }>;
}): Promise<{ changeRequestId: string } | { error: string; issues?: string[] }> {
  const rows = await getClientConfigPortfolioConfigurations();
  const existing = rows.find((r) => r.primaryAccountId === args.primaryAccountId);
  if (!existing) {
    return { error: `primaryAccountId "${args.primaryAccountId}" bestaat niet.` };
  }

  // Resolve the change type slug with a backward-compatible fallback: the
  // explicit lifecycle slugs (portfolio_configuration_update / _retire) may
  // not be seeded in the catalog yet, in which case existing flows keep
  // staging under the legacy portfolio_addition slug.
  const changeTypeSlug = await resolveChangeTypeSlugWithFallback(args.changeTypeSlug);

  const changeTypeConfig = await getChangeTypeBySlug(changeTypeSlug);
  if (!changeTypeConfig) {
    return { error: `Change type "${changeTypeSlug}" bestaat niet.` };
  }

  const todayLocal = getTodayDateString();
  if (args.effectiveDate < todayLocal) {
    return { error: "De ingangsdatum mag niet in het verleden liggen.", issues: ["De ingangsdatum mag niet in het verleden liggen."] };
  }

  const merged = {
    clientCode: args.fieldOverrides?.clientCode ?? existing.clientCode,
    portfolioCode: args.fieldOverrides?.portfolioCode ?? existing.portfolioCode,
    assetClassCode: args.fieldOverrides?.assetClassCode ?? existing.assetClassCode,
    subAssetClassCode: args.fieldOverrides?.subAssetClassCode ?? existing.subAssetClassCode,
    managerCode: args.fieldOverrides?.managerCode ?? existing.managerCode,
    benchmarkCode: args.fieldOverrides?.benchmarkCode ?? existing.benchmarkCode,
    npcClassificationId: args.fieldOverrides?.npcClassificationId ?? existing.npcClassificationId,
    longName: args.fieldOverrides?.longName ?? existing.longName,
    shortName: args.fieldOverrides?.shortName ?? existing.shortName,
    effectiveFrom: args.effectiveDate,
    effectiveUntil: existing.effectiveUntil,
  };

  const validation = validateChangePortfolioConfiguration({
    changeRequestId: "00000000-0000-0000-0000-000000000000", // placeholder, replaced below
    actionType: args.actionType,
    targetPrimaryAccountId: args.actionType === "CREATE" ? null : existing.primaryAccountId,
    clientCode: merged.clientCode,
    portfolioCode: merged.portfolioCode,
    assetClassCode: merged.assetClassCode,
    subAssetClassCode: merged.subAssetClassCode,
    managerCode: merged.managerCode,
    benchmarkCode: merged.benchmarkCode,
    npcClassificationId: merged.npcClassificationId,
    longName: merged.longName,
    shortName: merged.shortName,
    effectiveFrom: merged.effectiveFrom,
    effectiveUntil: merged.effectiveUntil,
  });
  if (!validation.valid) {
    return { error: validation.errors.join(" "), issues: validation.errors };
  }

  const id = randomUUID();
  const reference = generateReference(changeTypeSlug);

  try {
    await saveChangeRequest({
      id,
      reference,
      changeType: changeTypeSlug,
      changeTypeId: changeTypeConfig.id,
      clientId: id, // change request id is the operational key for these config changes
      requestedBy: args.requestedBy,
      rationale: args.rationale,
      effectiveDate: args.effectiveDate,
      items: [],
      fields: [
        { fieldKey: "primary_account_id", istValue: existing.primaryAccountId, sollValue: existing.primaryAccountId },
        { fieldKey: "action_type", istValue: null, sollValue: args.actionType },
        { fieldKey: "client_code", istValue: existing.clientCode, sollValue: merged.clientCode },
        { fieldKey: "portfolio_code", istValue: existing.portfolioCode, sollValue: merged.portfolioCode },
        { fieldKey: "asset_class_code", istValue: existing.assetClassCode, sollValue: merged.assetClassCode },
        { fieldKey: "sub_asset_class_code", istValue: existing.subAssetClassCode, sollValue: merged.subAssetClassCode },
        { fieldKey: "manager_code", istValue: existing.managerCode, sollValue: merged.managerCode },
        { fieldKey: "benchmark_code", istValue: existing.benchmarkCode, sollValue: merged.benchmarkCode },
        { fieldKey: "npc_classification_id", istValue: existing.npcClassificationId, sollValue: String(merged.npcClassificationId) },
        { fieldKey: "long_name", istValue: existing.longName, sollValue: merged.longName },
        { fieldKey: "short_name", istValue: existing.shortName, sollValue: merged.shortName },
      ],
      estimatedCost: changeTypeConfig.cost?.baseCost ?? 0,
      estimatedCostCurrency: changeTypeConfig.cost?.costCurrency ?? "EUR",
      estimatedLeadDays: changeTypeConfig.defaultLeadDays,
      stakeholderAssignments: changeTypeConfig.stakeholders
        .filter((s) => s.mandatory)
        .map((s) => ({
          stakeholderId: s.id,
          contact: `${s.id}@bcm.example.com`,
          notifiedAt: null,
        })),
    });

    const stage = await stageChangePortfolioConfiguration({
      changeRequestId: id,
      actionType: args.actionType,
      primaryAccountId: existing.primaryAccountId,
      targetPrimaryAccountId: args.actionType === "CREATE" ? null : existing.primaryAccountId,
      clientCode: merged.clientCode,
      portfolioCode: merged.portfolioCode,
      assetClassCode: merged.assetClassCode,
      subAssetClassCode: merged.subAssetClassCode,
      managerCode: merged.managerCode,
      benchmarkCode: merged.benchmarkCode,
      npcClassificationId: merged.npcClassificationId,
      longName: merged.longName,
      shortName: merged.shortName,
      effectiveFrom: args.effectiveDate,
      effectiveUntil: merged.effectiveUntil,
    });
    if (!stage.ok) {
      return { error: stage.issues.join(" "), issues: stage.issues };
    }
  } catch (error) {
    await reportError(error, { action: "dispatchClientConfigChange" });
    const message = error instanceof Error ? error.message : "Change kon niet worden aangemaakt.";
    return { error: message, issues: [message] };
  }

  return { changeRequestId: id, reference } as any;
}

// ─────────────────────────────────────────────────────────────────────────
// Public server actions used by the admin client-config UI
// ─────────────────────────────────────────────────────────────────────────

/**
 * Server action to update the asset_class of an existing portfolio.
 * Creates a change request and redirects the operator to the change detail
 * page. Direct mutation of the configuration is NOT performed here.
 */
export async function updateClientAssetClassAction(
  _prev: UpdateAssetClassState,
  formData: FormData,
): Promise<UpdateAssetClassState> {
  const input = clientConfigEditSchema.extend({
    assetClass: z.string().min(1, "Asset class is verplicht."),
  }).safeParse(Object.fromEntries(formData));

  if (!input.success) {
    return {
      success: false,
      error: input.error.issues.map((i) => i.message).join(", "),
      issues: input.error.issues.map((i) => i.message),
    };
  }

  try {
    // Look up the asset_class_code from the supplied name.
    const { getClientConfigReferenceData } = await import("@/lib/client-config-db");
    const ref = await getClientConfigReferenceData();
    const ac = ref.assetClasses.find((a) => a.assetClassName === input.data.assetClass);
    if (!ac) {
      return { success: false, error: `Asset class "${input.data.assetClass}" bestaat niet.` };
    }

    const result = await dispatchClientConfigChange({
      primaryAccountId: input.data.primaryAccountId,
      changeTypeSlug: "portfolio_configuration_update",
      actionType: "UPDATE",
      rationale: input.data.rationale,
      requestedBy: input.data.requestedBy,
      effectiveDate: input.data.effectiveDate,
      fieldOverrides: { assetClassCode: ac.assetClassCode },
    });

    if ("error" in result) {
      return { success: false, error: result.error, issues: result.issues };
    }
  } catch (error) {
    captureError(error, { endpoint: "updateClientAssetClassAction", phase: "dispatch" });
    return { success: false, error: error instanceof Error ? error.message : "Onbekende fout." };
  }

  redirect("/changes");
  return { success: true };
}

export type UpdatePortfolioAttributeState = {
  success?: boolean;
  error?: string;
  issues?: string[];
};

/**
 * Update one of the attribute columns of a portfolio_configuration row.
 * Always via a change request.
 */
export async function updatePortfolioAttributeAction(
  _prev: UpdatePortfolioAttributeState,
  formData: FormData,
): Promise<UpdatePortfolioAttributeState> {
  const input = clientConfigEditSchema.extend({
    column: z.enum(
      [
        "asset_class_code",
        "sub_asset_class_code",
        "manager_code",
        "benchmark_code",
        "npc_classification_id",
      ],
      { message: "Ongeldige kolom." },
    ),
    value: z.string().min(1, "Waarde is verplicht."),
  }).safeParse(Object.fromEntries(formData));

  if (!input.success) {
    return {
      success: false,
      error: input.error.issues.map((i) => i.message).join(", "),
      issues: input.error.issues.map((i) => i.message),
    };
  }

  const overrides: Parameters<typeof dispatchClientConfigChange>[0]["fieldOverrides"] = {};
  if (input.data.column === "npc_classification_id") {
    overrides.npcClassificationId = Number(input.data.value);
  } else {
    (overrides as Record<string, string>)[input.data.column] = input.data.value;
  }

  try {
    const result = await dispatchClientConfigChange({
      primaryAccountId: input.data.primaryAccountId,
      changeTypeSlug: "portfolio_configuration_update",
      actionType: "UPDATE",
      rationale: input.data.rationale,
      requestedBy: input.data.requestedBy,
      effectiveDate: input.data.effectiveDate,
      fieldOverrides: overrides,
    });
    if ("error" in result) {
      return { success: false, error: result.error, issues: result.issues };
    }
  } catch (error) {
    captureError(error, { endpoint: "updatePortfolioAttributeAction", phase: "dispatch" });
    return { success: false, error: error instanceof Error ? error.message : "Onbekende fout." };
  }

  redirect("/changes");
  return { success: true };
}

export type UpdatePortfolioAssetClassFieldsState = {
  success?: boolean;
  error?: string;
  issues?: string[];
};

/**
 * Update a portfolio's assetClass and/or subAssetClass via the change
 * process. Direct mutation of the live configuration is not performed.
 */
export async function updatePortfolioAssetClassFieldsAction(
  _prev: UpdatePortfolioAssetClassFieldsState,
  formData: FormData,
): Promise<UpdatePortfolioAssetClassFieldsState> {
  const input = clientConfigEditSchema.extend({
    asset_class: z.string().optional(),
    sub_asset_class: z.string().optional(),
  }).safeParse(Object.fromEntries(formData));

  if (!input.success) {
    return {
      success: false,
      error: input.error.issues.map((i) => i.message).join(", "),
      issues: input.error.issues.map((i) => i.message),
    };
  }

  if (!input.data.asset_class && !input.data.sub_asset_class) {
    return { success: false, error: "Geen wijzigingen aangeleverd." };
  }

  // Validate the asset-class / sub-asset-class pair using the existing
  // portfolio-validation helper (which is dimension-aware).
  const pairErrors = validatePortfolioFields({
    assetClass: input.data.asset_class ?? null,
    subAssetClass: input.data.sub_asset_class ?? null,
  });
  if (pairErrors.length > 0) {
    return { success: false, error: pairErrors.join(" "), issues: pairErrors };
  }

  // Translate asset-class / sub-asset-class names into codes.
  const { getClientConfigReferenceData } = await import("@/lib/client-config-db");
  const ref = await getClientConfigReferenceData();
  let assetClassCode: string | undefined;
  let subAssetClassCode: string | undefined;
  if (input.data.asset_class) {
    const ac = ref.assetClasses.find((a) => a.assetClassName === input.data.asset_class);
    if (!ac) {
      return { success: false, error: `Asset class "${input.data.asset_class}" bestaat niet.` };
    }
    assetClassCode = ac.assetClassCode;
  }
  if (input.data.sub_asset_class) {
    const sub = ref.subAssetClasses.find((s) => s.subAssetClassName === input.data.sub_asset_class);
    if (!sub) {
      return { success: false, error: `Sub asset class "${input.data.sub_asset_class}" bestaat niet.` };
    }
    subAssetClassCode = sub.subAssetClassCode;
  }

  try {
    const result = await dispatchClientConfigChange({
      primaryAccountId: input.data.primaryAccountId,
      changeTypeSlug: "portfolio_configuration_update",
      actionType: "UPDATE",
      rationale: input.data.rationale,
      requestedBy: input.data.requestedBy,
      effectiveDate: input.data.effectiveDate,
      fieldOverrides: {
        ...(assetClassCode ? { assetClassCode } : {}),
        ...(subAssetClassCode ? { subAssetClassCode } : {}),
      },
    });
    if ("error" in result) {
      return { success: false, error: result.error, issues: result.issues };
    }
  } catch (error) {
    captureError(error, { endpoint: "updatePortfolioAssetClassFieldsAction", phase: "dispatch" });
    return { success: false, error: error instanceof Error ? error.message : "Onbekende fout." };
  }

  redirect("/changes");
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────
// DELETE action — explicit operator command to retire a portfolio config
// ─────────────────────────────────────────────────────────────────────────

export type DeletePortfolioConfigurationState = {
  success?: boolean;
  error?: string;
  issues?: string[];
};

export async function deletePortfolioConfigurationAction(
  _prev: DeletePortfolioConfigurationState,
  formData: FormData,
): Promise<DeletePortfolioConfigurationState> {
  const input = clientConfigEditSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) {
    return {
      success: false,
      error: input.error.issues.map((i) => i.message).join(", "),
      issues: input.error.issues.map((i) => i.message),
    };
  }

  try {
    const result = await dispatchClientConfigChange({
      primaryAccountId: input.data.primaryAccountId,
      changeTypeSlug: "portfolio_configuration_retire",
      actionType: "DELETE",
      rationale: input.data.rationale,
      requestedBy: input.data.requestedBy,
      effectiveDate: input.data.effectiveDate,
    });
    if ("error" in result) {
      return { success: false, error: result.error, issues: result.issues };
    }
  } catch (error) {
    captureError(error, { endpoint: "deletePortfolioConfigurationAction", phase: "dispatch" });
    return { success: false, error: error instanceof Error ? error.message : "Onbekende fout." };
  }

  redirect("/changes");
  return { success: true };
}

// Re-export for use in unit tests
export { dispatchClientConfigChange };
