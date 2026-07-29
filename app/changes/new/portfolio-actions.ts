"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getChangeTypeBySlug, saveChangeRequest } from "@/lib/db";
import { getClientConfigReferenceData, saveChangePortfolioConfiguration } from "@/lib/client-config-db";
import type { ChangeFieldValue, ClientConfigReferenceData } from "@/lib/types";
import { computeEstimatedCost, generateReference, getTodayDateString } from "@/lib/change-form-utils";
import { generatePrimaryAccountId, isValidLongName, isValidShortName, lookupCodes } from "@/lib/portfolio-config";
import { reportError } from "@/lib/error-reporter";

export type PortfolioFormState = { message?: string; issues?: string[] };

const portfolioSchema = z.object({
  portfolioCode: z.string().trim().regex(/^[A-Z0-9]{2,15}$/, "Portfolio code moet 2-15 hoofdletters/cijfers zijn."),
  assetClass: z.string().trim().min(1, "Selecteer een geldige asset class."),
  subAssetClass: z.string().trim().min(1, "Selecteer een geldige sub asset class."),
  managerCode: z.string().trim().regex(/^[A-Z0-9]{3}$/, "Manager code moet 3 hoofdletters/cijfers zijn."),
  benchmarkCode: z.string().trim().min(1, "Selecteer een geldige benchmark."),
  npcClassificationId: z.coerce.number().int().positive("Selecteer een geldige NPC classificatie."),
  longName: z.string().trim().min(1, "Lange naam is verplicht.").max(255),
  shortName: z.string().trim().min(1, "Korte naam is verplicht.").max(100),
  requestedBy: z.string().trim().min(2, "Vul de naam van de aanvrager in."),
  rationale: z.string().trim().min(10, "Licht de reden van de wijziging in minimaal 10 tekens toe."),
  effectiveDate: z.string().date("Kies een geldige ingangsdatum."),
});

function validatePortfolioAgainstReferenceData(
  input: z.infer<typeof portfolioSchema>,
  referenceData: ClientConfigReferenceData,
): string[] {
  // NOTE: When no DATABASE_URL is set, referenceData comes from demo fixtures
  // (lib/fixtures.ts). Only demo fixture values will pass validation.
  // This is by design for the e2e test environment.
  const issues: string[] = [];

  if (!referenceData.portfolios.some((p) => p.portfolioCode === input.portfolioCode)) {
    issues.push("De gekozen portfolio code bestaat niet.");
  }

  const assetClass = referenceData.assetClasses.find((ac) => ac.assetClassName === input.assetClass);
  if (!assetClass) {
    issues.push("De gekozen asset class bestaat niet.");
  } else if (!referenceData.subAssetClasses.some(
    (sac) => sac.assetClassId === assetClass.assetClassId && sac.subAssetClassName === input.subAssetClass
  )) {
    issues.push("De gekozen sub asset class hoort niet bij de geselecteerde asset class.");
  }

  if (!referenceData.managers.some((m) => m.managerCode === input.managerCode)) {
    issues.push("De gekozen manager code bestaat niet.");
  }

  if (!referenceData.benchmarks.some((b) => b.benchmarkCode === input.benchmarkCode)) {
    issues.push("De gekozen benchmark code bestaat niet in de catalogus.");
  }

  if (!referenceData.npcClassifications.some((nc) => nc.npcClassificationId === input.npcClassificationId)) {
    issues.push("De gekozen NPC classificatie bestaat niet.");
  }

  return issues;
}

/**
 * Server action for creating a portfolio_addition change request using the
 * normalized client_config schema. Collects dimension codes, validates against
 * reference data, and stages a change_portfolio_configuration row.
 */
export async function createPortfolioAdditionChange(
  _: PortfolioFormState,
  formData: FormData,
): Promise<PortfolioFormState> {
  // ── 1. Parse and validate ──
  const raw = Object.fromEntries(formData);
  const input = portfolioSchema.safeParse(raw);

  if (!input.success) {
    return { issues: input.error.issues.map((issue) => issue.message) };
  }

  const todayLocal = getTodayDateString();
  if (input.data.effectiveDate < todayLocal) {
    return { issues: ["De ingangsdatum mag niet in het verleden liggen."] };
  }

  if (!isValidLongName(input.data.longName)) {
    return { issues: ["Lange naam mag geen regeleinden bevatten en moet tussen 1 en 255 tekens zijn."] };
  }
  if (!isValidShortName(input.data.shortName)) {
    return { issues: ["Korte naam mag geen regeleinden bevatten en moet tussen 1 en 100 tekens zijn."] };
  }

  const codes = lookupCodes(input.data.assetClass, input.data.subAssetClass);
  if (!codes) {
    return { issues: ["De combinatie van asset class en sub asset class is niet geldig."] };
  }

  const primaryAccountId = generatePrimaryAccountId(
    input.data.portfolioCode,
    codes.assetClassCode,
    codes.subAssetClassCode,
    input.data.managerCode,
  );

  // ── 2. Load change type config and reference data ──
  const [changeTypeConfig, referenceData] = await Promise.all([
    getChangeTypeBySlug("portfolio_addition"),
    getClientConfigReferenceData(),
  ]);

  if (!changeTypeConfig) {
    return { issues: ["Change type \"Nieuwe portfolio toevoegen\" bestaat niet."] };
  }

  const referenceIssues = validatePortfolioAgainstReferenceData(input.data, referenceData);
  if (referenceIssues.length > 0) {
    return { issues: referenceIssues };
  }

  // ── 3. Build IST/SOLL field pairs ──
  const fields: ChangeFieldValue[] = [
    { fieldKey: "portfolio_code", istValue: null, sollValue: input.data.portfolioCode },
    { fieldKey: "asset_class_code", istValue: null, sollValue: codes.assetClassCode },
    { fieldKey: "sub_asset_class_code", istValue: null, sollValue: codes.subAssetClassCode },
    { fieldKey: "manager_code", istValue: null, sollValue: input.data.managerCode },
    { fieldKey: "benchmark_code", istValue: null, sollValue: input.data.benchmarkCode },
    { fieldKey: "npc_classification_id", istValue: null, sollValue: String(input.data.npcClassificationId) },
    { fieldKey: "long_name", istValue: null, sollValue: input.data.longName },
    { fieldKey: "short_name", istValue: null, sollValue: input.data.shortName },
    { fieldKey: "primary_account_id", istValue: null, sollValue: primaryAccountId },
  ];

  // ── 4. Compute cost ──
  const cost = computeEstimatedCost(changeTypeConfig, 1);

  // ── 5. Save ──
  const id = randomUUID();
  const reference = generateReference("portfolio_addition");

  try {
    await saveChangeRequest({
      id,
      reference,
      changeType: "portfolio_addition",
      changeTypeId: changeTypeConfig.id,
      clientId: id, // primary_account_id is the operational key; use change request id as client id placeholder
      requestedBy: input.data.requestedBy,
      rationale: input.data.rationale,
      effectiveDate: input.data.effectiveDate,
      items: [],
      fields,
      estimatedCost: cost.cost,
      estimatedCostCurrency: cost.currency,
      estimatedLeadDays: changeTypeConfig.defaultLeadDays,
      stakeholderAssignments: changeTypeConfig.stakeholders
        .filter((s) => s.mandatory)
        .map((s) => ({
          stakeholderId: s.id,
          contact: `${s.id}@bcm.example.com`,
          notifiedAt: null,
        })),
    });

    await saveChangePortfolioConfiguration({
      changeRequestId: id,
      actionType: "CREATE",
      portfolioCode: input.data.portfolioCode,
      assetClassCode: codes.assetClassCode,
      subAssetClassCode: codes.subAssetClassCode,
      managerCode: input.data.managerCode,
      benchmarkCode: input.data.benchmarkCode,
      npcClassificationId: input.data.npcClassificationId,
      longName: input.data.longName,
      shortName: input.data.shortName,
      effectiveFrom: input.data.effectiveDate,
      effectiveUntil: null,
    });
  } catch (error) {
    await reportError(error, { action: "create-portfolio-addition-change" });
    const message = error instanceof Error ? error.message : "De change kon niet worden opgeslagen.";
    if (message.includes("foreign key constraint") || message.includes("violates foreign key")) {
      return { issues: ["Er is een inconsistentie in de database — de change verwijst naar een niet-bestaande dimensie. Neem contact op met de beheerder."] };
    }
    return { issues: [message] };
  }

  redirect(`/changes/${id}`);
}
