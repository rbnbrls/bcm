"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getClientConfigs, getChangeTypeBySlug, saveChangeRequest } from "@/lib/db";
import { getClientConfigReferenceData, stageChangeLookupRequest } from "@/lib/client-config-db";
import { getTodayDateString, generateReference, validateEffectiveDate } from "@/lib/change-form-utils";
import { reportError } from "@/lib/error-reporter";
import { accessDeniedIssue, requirePermission } from "@/lib/rbac-request";
import { getChangeTypePermission } from "@/lib/change-type-registry";

export type FormState = { message?: string; issues?: string[] };

const subAssetClassSchema = z.object({
  clientId: z.string().uuid("Kies een geldige klant."),
  requestedBy: z.string().trim().min(2, "Vul de naam van de aanvrager in."),
  rationale: z.string().trim().min(10, "Licht de reden van de aanvraag in minimaal 10 tekens toe."),
  effectiveDate: z.string().date("Kies een geldige ingangsdatum."),
  parentAssetClass: z.string().trim().min(2, "Kies de bestaande asset class."),
  subAssetClassCode: z.string().trim().regex(/^[A-Za-z]{3}$/, "Sub asset class code moet uit precies 3 letters bestaan (bijv. PRI).").toUpperCase(),
  subAssetClassName: z.string().trim().min(2, "Sub asset class naam is verplicht (minimaal 2 tekens).").max(100, "Sub asset class naam mag maximaal 100 tekens bevatten."),
  sortOrder: z.string().optional(),
});

/**
 * Server action for requesting a new sub asset class under an existing asset
 * class through the governed change workflow. Creates a change request
 * (submitted) and stages the lookup addition. The value is applied to the
 * live sub_asset_class table only when the change reaches 'processed'.
 */
export async function createNewSubAssetClass(_: FormState, formData: FormData): Promise<FormState> {
  const access = await requirePermission(getChangeTypePermission("new_sub_asset_class", "create"));
  if (!access.authorized) return { issues: [accessDeniedIssue(access)] };

  const input = subAssetClassSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { issues: input.error.issues.map((issue) => issue.message) };

  const { data } = input;

  const todayLocal = getTodayDateString();
  if (data.effectiveDate < todayLocal) {
    return { issues: ["De ingangsdatum mag niet in het verleden liggen."] };
  }

  const clients = await getClientConfigs();
  const client = clients.find((c) => c.id === data.clientId);
  if (!client) return { issues: ["De gekozen klant bestaat niet in de client config."] };

  // Resolve the selected asset class to its 2-letter code via reference data.
  const referenceData = await getClientConfigReferenceData();
  const parent = referenceData.assetClasses.find(
    (ac) => ac.assetClassName === data.parentAssetClass || ac.assetClassCode === data.parentAssetClass,
  );
  if (!parent) {
    return { issues: [`Asset class "${data.parentAssetClass}" bestaat niet in de referentiedata.`] };
  }

  const sortOrderParsed = data.sortOrder && data.sortOrder.trim() !== "" ? Number(data.sortOrder) : null;
  if (sortOrderParsed !== null && (!Number.isInteger(sortOrderParsed) || sortOrderParsed < 1)) {
    return { issues: ["Sorteervolgorde moet een positief geheel getal zijn."] };
  }

  const id = randomUUID();
  const reference = generateReference("new_sub_asset_class");

  try {
    const changeTypeConfig = await getChangeTypeBySlug("new_sub_asset_class");
    if (changeTypeConfig) {
      if (!changeTypeConfig.active) {
        return { issues: ["Change type \"Nieuwe sub asset class\" is gedeactiveerd voor nieuwe aanvragen."] };
      }
      const leadTimeError = validateEffectiveDate(data.effectiveDate, changeTypeConfig.defaultLeadDays);
      if (leadTimeError) return { issues: [leadTimeError] };
    }

    await saveChangeRequest({
      id,
      reference,
      changeType: "new_sub_asset_class",
      changeTypeId: changeTypeConfig?.id,
      clientId: data.clientId,
      requestedBy: access.identity.displayName,
      rationale: data.rationale,
      effectiveDate: data.effectiveDate,
      items: [],
      fields: [
        { fieldKey: "parent_asset_class", istValue: null, sollValue: parent.assetClassName },
        { fieldKey: "parent_asset_class_code", istValue: null, sollValue: parent.assetClassCode },
        { fieldKey: "sub_asset_class_code", istValue: null, sollValue: data.subAssetClassCode },
        { fieldKey: "sub_asset_class_name", istValue: null, sollValue: data.subAssetClassName },
        { fieldKey: "sort_order", istValue: null, sollValue: sortOrderParsed },
      ],
      estimatedCost: changeTypeConfig?.cost.baseCost ?? 1500,
      estimatedCostCurrency: "EUR",
      estimatedLeadDays: changeTypeConfig?.defaultLeadDays ?? 14,
    });

    const staged = await stageChangeLookupRequest({
      changeRequestId: id,
      dimension: "sub_asset_class",
      parentAssetClassCode: parent.assetClassCode,
      subAssetClassCode: data.subAssetClassCode,
      subAssetClassName: data.subAssetClassName,
      sortOrder: sortOrderParsed,
    });
    if (!staged.ok) return { issues: staged.issues };
  } catch (error) {
    await reportError(error, { action: "create-new-sub-asset-class" });
    const message = error instanceof Error ? error.message : "De aanvraag kon niet worden opgeslagen.";
    if (message.includes("foreign key constraint") || message.includes("violates foreign key")) {
      return { issues: ["Er is een inconsistentie in de database — de aanvraag verwijst naar een niet-bestaande waarde. Neem contact op met de beheerder."] };
    }
    return { issues: [message] };
  }

  redirect(`/changes/${id}`);
}
