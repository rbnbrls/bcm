"use server";

import { randomUUID } from "crypto";
import { z } from "zod";
import { redirect } from "next/navigation";
import {
  getChangeTypeBySlug,
  saveChangeRequest,
  getChangeRequest,
  getPublicClientIdByCode,
} from "@/lib/db";
import { getClientConfigPortfolioConfigurations, getClientConfigReferenceData, stageChangePortfolioConfiguration } from "@/lib/client-config-db";
import { validatePortfolioFields } from "@/lib/portfolio-validation";
import {
  validateChangePortfolioConfiguration,
  type ChangeActionType,
} from "@/lib/validation-rules";
import { captureError } from "@/lib/sentry-helper";
import { reportError } from "@/lib/error-reporter";
import { requireAdmin } from "@/lib/admin-auth-request";
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
  actionType: ChangeActionType;
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
    activeInd: boolean;
    effectiveUntil: string | null;
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
    activeInd: args.fieldOverrides?.activeInd ?? existing.activeInd,
    effectiveFrom: args.effectiveDate,
    effectiveUntil: args.fieldOverrides?.effectiveUntil ?? existing.effectiveUntil,
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

  // Resolve a real `clients.id` so the change_requests.client_id FK is
  // satisfied (a random placeholder UUID violates it on a real database —
  // see #525 / t_d556c774). Fail closed when no legacy clients row maps to
  // the client code; this dispatch path already requires a database (the
  // existing-row lookup above fails first in no-DB demo environments), so
  // there is no placeholder fallback to preserve.
  const clientId = await getPublicClientIdByCode(merged.clientCode);
  if (!clientId) {
    const message = `Klant "${merged.clientCode}" is niet geregistreerd in de klantenadministratie. Neem contact op met de beheerder.`;
    return { error: message, issues: [message] };
  }

  try {
    await saveChangeRequest({
      id,
      reference,
      changeType: changeTypeSlug,
      changeTypeId: changeTypeConfig.id,
      clientId, // primary_account_id is the operational key; use change request id as client id placeholder
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
        { fieldKey: "active_ind", istValue: String(existing.activeInd), sollValue: String(merged.activeInd) },
        { fieldKey: "effective_from", istValue: existing.effectiveFrom, sollValue: merged.effectiveFrom },
        { fieldKey: "effective_until", istValue: existing.effectiveUntil, sollValue: merged.effectiveUntil },
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
      activeInd: merged.activeInd,
      effectiveFrom: args.effectiveDate,
      // DELETE (retire): the requested retirement date is the date the live
      // row must be closed out — stage it as effective_until so the staged
      // row self-describes the retirement. The apply step uses it verbatim
      // (falling back to effective_from / today for older staged rows).
      effectiveUntil:
        args.actionType === "DELETE" ? args.effectiveDate : merged.effectiveUntil,
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
  const auth = await requireAdmin();
  if (!auth.authorized) {
    return { success: false, error: auth.message, issues: [auth.message] };
  }
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

  let changeRequestId: string | undefined;
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
      requestedBy: auth.identity.displayName,
      effectiveDate: input.data.effectiveDate,
      fieldOverrides: { assetClassCode: ac.assetClassCode },
    });

    if ("error" in result) {
      return { success: false, error: result.error, issues: result.issues };
    }
    changeRequestId = result.changeRequestId;
  } catch (error) {
    captureError(error, { endpoint: "updateClientAssetClassAction", phase: "dispatch" });
    return { success: false, error: error instanceof Error ? error.message : "Onbekende fout." };
  }

  redirect(`/changes/${changeRequestId}`);
  return { success: true, changeRequestId };
}

export type UpdatePortfolioAttributeState = {
  success?: boolean;
  error?: string;
  changeRequestId?: string;
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
  const auth = await requireAdmin();
  if (!auth.authorized) {
    return { success: false, error: auth.message, issues: [auth.message] };
  }
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

  let changeRequestId: string | undefined;
  try {
    const result = await dispatchClientConfigChange({
      primaryAccountId: input.data.primaryAccountId,
      changeTypeSlug: "portfolio_configuration_update",
      actionType: "UPDATE",
      rationale: input.data.rationale,
      requestedBy: auth.identity.displayName,
      effectiveDate: input.data.effectiveDate,
      fieldOverrides: overrides,
    });
    if ("error" in result) {
      return { success: false, error: result.error, issues: result.issues };
    }
    changeRequestId = result.changeRequestId;
  } catch (error) {
    captureError(error, { endpoint: "updatePortfolioAttributeAction", phase: "dispatch" });
    return { success: false, error: error instanceof Error ? error.message : "Onbekende fout." };
  }

  redirect(`/changes/${changeRequestId}`);
  return { success: true, changeRequestId };
}

export type UpdatePortfolioAssetClassFieldsState = {
  success?: boolean;
  error?: string;
  changeRequestId?: string;
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
  const auth = await requireAdmin();
  if (!auth.authorized) {
    return { success: false, error: auth.message, issues: [auth.message] };
  }
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

  let changeRequestId: string | undefined;
  try {
    const result = await dispatchClientConfigChange({
      primaryAccountId: input.data.primaryAccountId,
      changeTypeSlug: "portfolio_configuration_update",
      actionType: "UPDATE",
      rationale: input.data.rationale,
      requestedBy: auth.identity.displayName,
      effectiveDate: input.data.effectiveDate,
      fieldOverrides: {
        ...(assetClassCode ? { assetClassCode } : {}),
        ...(subAssetClassCode ? { subAssetClassCode } : {}),
      },
    });
    if ("error" in result) {
      return { success: false, error: result.error, issues: result.issues };
    }
    changeRequestId = result.changeRequestId;
  } catch (error) {
    captureError(error, { endpoint: "updatePortfolioAssetClassFieldsAction", phase: "dispatch" });
    return { success: false, error: error instanceof Error ? error.message : "Onbekende fout." };
  }

  redirect(`/changes/${changeRequestId}`);
  return { success: true, changeRequestId };
}

export type UpdateClientConfigRowState = {
  success?: boolean;
  error?: string;
  changeRequestId?: string;
  issues?: string[];
  /** Field-keyed validation errors for inline display in the wizard. */
  fieldErrors?: Record<string, string>;
};

/**
 * Schema for the full-row update wizard (t_cb7f89f2): every mutable field of
 * a portfolio_configuration row, prefilled from the live row as initial
 * state (IST) and editable by the operator before submission.
 */
const updateClientConfigRowSchema = clientConfigEditSchema.extend({
  clientCode: z.string().min(1, "Klantcode is verplicht.").optional(),
  portfolioCode: z.string().min(1, "Portfolio code is verplicht."),
  assetClassCode: z.string().min(1, "Asset class code is verplicht."),
  subAssetClassCode: z.string().min(1, "Sub asset class code is verplicht."),
  managerCode: z.string().min(1, "Manager code is verplicht."),
  benchmarkCode: z.string().min(1, "Benchmark code is verplicht."),
  npcClassificationId: z.coerce.number().int().min(0, "NPC classificatie is verplicht."),
  longName: z.string().min(1, "Lange naam is verplicht."),
  shortName: z.string().min(1, "Korte naam is verplicht."),
  activeInd: z.enum(["true", "false"], { message: "Actief-indicator is verplicht." }).transform((value) => value === "true").optional(),
  effectiveUntil: z.preprocess(
    (value) => value === "" || value == null ? null : value,
    z.string().date("Kies een geldige einddatum.").nullable().optional(),
  ),
});

/**
 * Business-rule validation for the update wizard's dimension selections
 * (t_4a1a1cbf). Validates the asset/sub-asset pair, benchmark, manager and
 * NPC selections against the client_config reference data (the authoritative
 * catalogs). Returns a field-keyed error map — an empty map means valid.
 *
 * NOTE: the wizard submits codes (assetClassCode, subAssetClassCode,
 * managerCode, benchmarkCode, npcClassificationId) — the same shape the
 * table stores — so each selection is checked for existence in its catalog
 * and the sub-asset class must belong to the selected asset class.
 */
async function validateRowSelectionsAgainstReferenceData(input: {
  clientCode?: string;
  assetClassCode: string;
  subAssetClassCode: string;
  managerCode: string;
  benchmarkCode: string;
  npcClassificationId: number;
}): Promise<Record<string, string>> {
  const referenceData = await getClientConfigReferenceData();
  const fieldErrors: Record<string, string> = {};

  if (input.clientCode && !referenceData.clients.some((client) => client.clientCode === input.clientCode)) {
    fieldErrors.clientCode = `Klant "${input.clientCode}" bestaat niet in de referentiedata.`;
  }

  const assetClass = referenceData.assetClasses.find(
    (ac) => ac.assetClassCode === input.assetClassCode,
  );
  if (!assetClass) {
    fieldErrors.assetClassCode = `Asset class "${input.assetClassCode}" bestaat niet in de referentiedata.`;
  } else if (
    !referenceData.subAssetClasses.some(
      (sac) =>
        sac.assetClassId === assetClass.assetClassId &&
        sac.subAssetClassCode === input.subAssetClassCode,
    )
  ) {
    fieldErrors.subAssetClassCode = `Sub asset class "${input.subAssetClassCode}" hoort niet bij asset class "${input.assetClassCode}".`;
  }

  if (!referenceData.managers.some((m) => m.managerCode === input.managerCode)) {
    fieldErrors.managerCode = `Manager "${input.managerCode}" bestaat niet in de referentiedata.`;
  }

  if (!referenceData.benchmarks.some((b) => b.benchmarkCode === input.benchmarkCode)) {
    fieldErrors.benchmarkCode = `Benchmark "${input.benchmarkCode}" bestaat niet in de catalogus.`;
  }

  if (
    !referenceData.npcClassifications.some(
      (nc) => nc.npcClassificationId === input.npcClassificationId,
    )
  ) {
    fieldErrors.npcClassificationId = `NPC classificatie ${input.npcClassificationId} bestaat niet in de referentiedata.`;
  }

  return fieldErrors;
}

/**
 * Form field names that render an inline error slot in the update wizard.
 * Zod issues on these fields surface next to their input; issues on the meta
 * fields (rationale, requestedBy, primaryAccountId) stay in the general
 * error block.
 */
const INLINE_ERROR_FIELDS = new Set([
  "portfolioCode",
  "clientCode",
  "assetClassCode",
  "subAssetClassCode",
  "managerCode",
  "benchmarkCode",
  "npcClassificationId",
  "longName",
  "shortName",
  "activeInd",
  "effectiveDate",
  "effectiveUntil",
]);

/**
 * Full-row update action used by the update wizard. All mutable fields are
 * submitted together; the change is staged as a governed UPDATE change
 * request (never a direct write). On success the operator is redirected to
 * the created change request detail page.
 */
export async function updateClientConfigRowAction(
  _prev: UpdateClientConfigRowState,
  formData: FormData,
): Promise<UpdateClientConfigRowState> {
  const auth = await requireAdmin();
  if (!auth.authorized) {
    return { success: false, error: auth.message, issues: [auth.message] };
  }
  const input = updateClientConfigRowSchema.safeParse(Object.fromEntries(formData));

  if (!input.success) {
    const issues = input.error.issues.map((i) => i.message);
    return {
      success: false,
      error: issues.join(", "),
      issues,
      fieldErrors: Object.fromEntries(
        input.error.issues
          .filter(
            (issue) =>
              issue.path.length > 0 &&
              INLINE_ERROR_FIELDS.has(String(issue.path[0])),
          )
          .map((issue) => [String(issue.path[0]), issue.message]),
      ),
    };
  }

  // Business-rule validation of the dimension selections — inline per-field
  // errors, nothing staged when any selection is invalid.
  const fieldErrors = await validateRowSelectionsAgainstReferenceData({
    clientCode: input.data.clientCode,
    assetClassCode: input.data.assetClassCode,
    subAssetClassCode: input.data.subAssetClassCode,
    managerCode: input.data.managerCode,
    benchmarkCode: input.data.benchmarkCode,
    npcClassificationId: input.data.npcClassificationId,
  });
  if (Object.keys(fieldErrors).length > 0) {
    return {
      success: false,
      error: Object.values(fieldErrors).join(" "),
      issues: Object.values(fieldErrors),
      fieldErrors,
    };
  }

  let changeRequestId: string | undefined;
  try {
    const result = await dispatchClientConfigChange({
      primaryAccountId: input.data.primaryAccountId,
      changeTypeSlug: "portfolio_configuration_update",
      actionType: "UPDATE",
      rationale: input.data.rationale,
      requestedBy: auth.identity.displayName,
      effectiveDate: input.data.effectiveDate,
      fieldOverrides: {
        clientCode: input.data.clientCode,
        portfolioCode: input.data.portfolioCode,
        assetClassCode: input.data.assetClassCode,
        subAssetClassCode: input.data.subAssetClassCode,
        managerCode: input.data.managerCode,
        benchmarkCode: input.data.benchmarkCode,
        npcClassificationId: input.data.npcClassificationId,
        longName: input.data.longName,
        shortName: input.data.shortName,
        activeInd: input.data.activeInd,
        effectiveUntil: input.data.effectiveUntil,
      },
    });
    if ("error" in result) {
      return { success: false, error: result.error, issues: result.issues };
    }
    changeRequestId = result.changeRequestId;
  } catch (error) {
    captureError(error, { endpoint: "updateClientConfigRowAction", phase: "dispatch" });
    return { success: false, error: error instanceof Error ? error.message : "Onbekende fout." };
  }

  // Redirect to the created change request detail page, not the dashboard.
  redirect(`/changes/${changeRequestId}`);
  return { success: true, changeRequestId };
}

// ─────────────────────────────────────────────────────────────────────────
// DELETE action — explicit operator command to retire a portfolio config
// ─────────────────────────────────────────────────────────────────────────

export type DeletePortfolioConfigurationState = {
  success?: boolean;
  error?: string;
  changeRequestId?: string;
  issues?: string[];
};

export async function deletePortfolioConfigurationAction(
  _prev: DeletePortfolioConfigurationState,
  formData: FormData,
): Promise<DeletePortfolioConfigurationState> {
  const auth = await requireAdmin();
  if (!auth.authorized) {
    return { success: false, error: auth.message, issues: [auth.message] };
  }
  const input = clientConfigEditSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) {
    return {
      success: false,
      error: input.error.issues.map((i) => i.message).join(", "),
      issues: input.error.issues.map((i) => i.message),
    };
  }

  let changeRequestId: string | undefined;
  try {
    const result = await dispatchClientConfigChange({
      primaryAccountId: input.data.primaryAccountId,
      changeTypeSlug: "portfolio_configuration_retire",
      actionType: "DELETE",
      rationale: input.data.rationale,
      requestedBy: auth.identity.displayName,
      effectiveDate: input.data.effectiveDate,
    });
    if ("error" in result) {
      return { success: false, error: result.error, issues: result.issues };
    }
    changeRequestId = result.changeRequestId;
  } catch (error) {
    captureError(error, { endpoint: "deletePortfolioConfigurationAction", phase: "dispatch" });
    return { success: false, error: error instanceof Error ? error.message : "Onbekende fout." };
  }

  redirect(`/changes/${changeRequestId}`);
  return { success: true, changeRequestId };
}

// Re-export for use in unit tests
export { dispatchClientConfigChange };
