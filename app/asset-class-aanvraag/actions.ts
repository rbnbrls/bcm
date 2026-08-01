"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getClientConfigs, getChangeTypeBySlug, saveChangeRequest } from "@/lib/db";
import { stageChangeLookupRequest } from "@/lib/client-config-db";
import { getTodayDateString, generateReference, validateEffectiveDate } from "@/lib/change-form-utils";
import { reportError } from "@/lib/error-reporter";

export type FormState = { message?: string; issues?: string[] };

const assetClassSchema = z.object({
  clientId: z.string().uuid("Kies een geldige klant."),
  requestedBy: z.string().trim().min(2, "Vul de naam van de aanvrager in."),
  rationale: z.string().trim().min(10, "Licht de reden van de aanvraag in minimaal 10 tekens toe."),
  effectiveDate: z.string().date("Kies een geldige ingangsdatum."),
  assetClassCode: z.string().trim().regex(/^[A-Za-z]{2}$/, "Asset class code moet uit precies 2 letters bestaan (bijv. PR).").toUpperCase(),
  assetClassName: z.string().trim().min(2, "Asset class naam is verplicht (minimaal 2 tekens).").max(30, "Asset class naam mag maximaal 30 tekens bevatten."),
  subAssetClasses: z.string().optional(),
});

/**
 * Server action for requesting a new asset class through the governed change
 * workflow. Creates a change request (submitted) and stages the lookup
 * addition in client_config.change_lookup_request. The value is applied to
 * the live asset_class table only when the change reaches 'processed'.
 */
export async function createNewAssetClass(_: FormState, formData: FormData): Promise<FormState> {
  const input = assetClassSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { issues: input.error.issues.map((issue) => issue.message) };

  const { data } = input;

  const todayLocal = getTodayDateString();
  if (data.effectiveDate < todayLocal) {
    return { issues: ["De ingangsdatum mag niet in het verleden liggen."] };
  }

  const clients = await getClientConfigs();
  const client = clients.find((c) => c.id === data.clientId);
  if (!client) return { issues: ["De gekozen klant bestaat niet in de client config."] };

  // Parse optional sub-asset-class lines: one per line, "CODE|Naam"
  const subAssetClasses: Array<{ code: string; name: string }> = [];
  if (data.subAssetClasses && data.subAssetClasses.trim().length > 0) {
    for (const rawLine of data.subAssetClasses.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const [code, ...nameParts] = line.split("|");
      const name = nameParts.join("|").trim();
      const trimmedCode = (code ?? "").trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(trimmedCode)) {
        return { issues: [`Sub asset class "${line}" — code moet uit precies 3 hoofdletters bestaan (bijv. PRI).`] };
      }
      if (name.length < 2) {
        return { issues: [`Sub asset class "${line}" — naam is verplicht na de | scheiding (CODE|Naam).`] };
      }
      subAssetClasses.push({ code: trimmedCode, name });
    }
  }

  const id = randomUUID();
  const reference = generateReference("new_asset_class");

  try {
    const changeTypeConfig = await getChangeTypeBySlug("new_asset_class");
    if (changeTypeConfig) {
      if (!changeTypeConfig.active) {
        return { issues: ["Change type \"Nieuwe asset class\" is gedeactiveerd voor nieuwe aanvragen."] };
      }
      const leadTimeError = validateEffectiveDate(data.effectiveDate, changeTypeConfig.defaultLeadDays);
      if (leadTimeError) return { issues: [leadTimeError] };
    }

    await saveChangeRequest({
      id,
      reference,
      changeType: "new_asset_class",
      changeTypeId: changeTypeConfig?.id,
      clientId: data.clientId,
      requestedBy: data.requestedBy,
      rationale: data.rationale,
      effectiveDate: data.effectiveDate,
      items: [],
      fields: [
        { fieldKey: "asset_class_code", istValue: null, sollValue: data.assetClassCode },
        { fieldKey: "asset_class_name", istValue: null, sollValue: data.assetClassName },
        ...subAssetClasses.map((s) => ({
          fieldKey: "sub_asset_class",
          istValue: null,
          sollValue: `${s.code}|${s.name}`,
        })),
      ],
      estimatedCost: changeTypeConfig?.cost.baseCost ?? 2500,
      estimatedCostCurrency: "EUR",
      estimatedLeadDays: changeTypeConfig?.defaultLeadDays ?? 21,
    });

    const staged = await stageChangeLookupRequest({
      changeRequestId: id,
      dimension: "asset_class",
      assetClassCode: data.assetClassCode,
      assetClassName: data.assetClassName,
    });
    if (!staged.ok) return { issues: staged.issues };

    // Stage the initial sub-asset-classes under the new asset class, so the
    // pair is validated and applied atomically with its parent.
    for (const sub of subAssetClasses) {
      const subStaged = await stageChangeLookupRequest({
        changeRequestId: id,
        dimension: "sub_asset_class",
        parentAssetClassCode: data.assetClassCode,
        subAssetClassCode: sub.code,
        subAssetClassName: sub.name,
      });
      if (!subStaged.ok) return { issues: subStaged.issues };
    }
  } catch (error) {
    await reportError(error, { action: "create-new-asset-class" });
    const message = error instanceof Error ? error.message : "De aanvraag kon niet worden opgeslagen.";
    if (message.includes("foreign key constraint") || message.includes("violates foreign key")) {
      return { issues: ["Er is een inconsistentie in de database — de aanvraag verwijst naar een niet-bestaande waarde. Neem contact op met de beheerder."] };
    }
    return { issues: [message] };
  }

  redirect(`/changes/${id}`);
}
