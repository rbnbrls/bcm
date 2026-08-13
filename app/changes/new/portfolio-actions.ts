"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getChangeTypeBySlug, getPublicClientIdByCode, saveChangeRequest, sql } from "@/lib/db";
import { getClientConfigReferenceData, saveChangePortfolioConfiguration } from "@/lib/client-config-db";
import type { ChangeFieldValue, ClientConfigReferenceData } from "@/lib/types";
import { generateReference, getTodayDateString, validateEffectiveDate } from "@/lib/change-form-utils";
import { generatePrimaryAccountId, isValidLongName, isValidShortName, lookupCodesFromReferenceData } from "@/lib/portfolio-config";
import { reportError } from "@/lib/error-reporter";
import { buildChangeTypeEstimate, buildMandatoryStakeholderAssignments } from "@/lib/change-types/request";
import {
  isPortfolioCreateWizardSlug,
  resolveChangeTypeSlugWithFallback,
} from "@/lib/change-type-resolution";
import { accessDeniedIssue, requirePermission } from "@/lib/rbac-request";
import { getChangeTypePermission } from "@/lib/change-type-registry";

export type PortfolioFormState = { message?: string; issues?: string[] };

const portfolioSchema = z.object({
  // Explicit client selection (portfolio_configuration_create). Optional for
  // backward compatibility with the legacy portfolio_addition form, which
  // omits it and relies on the portfolio-code-prefix derivation below.
  clientCode: z.string().trim().regex(/^[A-Z0-9]{1,3}$/, "Client code moet 1-3 hoofdletters/cijfers zijn.").optional(),
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

/**
 * Resolve the client code for a portfolio create request.
 *
 * The portfolio_configuration_create form submits an explicit clientCode
 * selected from client_config.client. The legacy portfolio_addition form
 * omits it; for backward compatibility the client is then derived from the
 * first three characters of the portfolio code.
 *
 * NOTE: exported functions in a "use server" module must be async — this
 * helper is exported for unit-testability and awaited by the callers.
 */
export async function resolvePortfolioClientCode(input: {
  clientCode?: string;
  portfolioCode: string;
}): Promise<string> {
  return input.clientCode?.trim().toUpperCase() ?? input.portfolioCode.slice(0, 3).toUpperCase();
}

async function validatePortfolioAgainstReferenceData(
  input: z.infer<typeof portfolioSchema>,
  referenceData: ClientConfigReferenceData,
): Promise<string[]> {
  // NOTE: When no DATABASE_URL is set, referenceData comes from demo fixtures
  // (lib/fixtures.ts). Only demo fixture values will pass validation.
  // This is by design for the e2e test environment.
  const issues: string[] = [];

  const clientCode = await resolvePortfolioClientCode(input);

  // ── Selected client must exist in client_config.client ──
  if (!referenceData.clients.some((c) => c.clientCode === clientCode)) {
    issues.push(
      input.clientCode
        ? `Client "${clientCode}" bestaat niet in de referentiedata.`
        : "De client code voor de gekozen portfolio bestaat niet.",
    );
  }

  // ── Portfolio metadata: exists, active, and owned by the selected client ──
  const portfolio = referenceData.portfolios.find((p) => p.portfolioCode === input.portfolioCode);
  if (!portfolio) {
    issues.push("De gekozen portfolio code bestaat niet.");
  } else if (portfolio.activeInd !== true) {
    issues.push(`Portfolio "${input.portfolioCode}" is niet actief.`);
  } else if (
    input.clientCode &&
    clientCode !== input.portfolioCode &&
    !input.portfolioCode.startsWith(clientCode)
  ) {
    issues.push(`Portfolio "${input.portfolioCode}" hoort niet bij client "${clientCode}".`);
  }

  const assetClass = referenceData.assetClasses.find((ac) => ac.assetClassName === input.assetClass);
  if (!assetClass) {
    issues.push(
      `Asset class "${input.assetClass}" bestaat niet. Een nieuwe asset class kan via het change proces worden aangevraagd.`,
    );
  } else if (!referenceData.subAssetClasses.some(
    (sac) => sac.assetClassId === assetClass.assetClassId && sac.subAssetClassName === input.subAssetClass
  )) {
    issues.push("De gekozen sub asset class hoort niet bij de geselecteerde asset class.");
  }

  if (!referenceData.managers.some((m) => m.managerCode === input.managerCode)) {
    issues.push(
      `Manager "${input.managerCode}" bestaat niet in de referentiedata. Managers worden alleen door de beheerder toegevoegd — neem contact op met support.`,
    );
  }

  if (!referenceData.benchmarks.some((b) => b.benchmarkCode === input.benchmarkCode)) {
    issues.push(
      `Benchmark "${input.benchmarkCode}" bestaat niet in de catalogus. Een nieuwe benchmark kan via de change catalog (Workflow Studio) worden aangevraagd.`,
    );
  }

  if (!referenceData.npcClassifications.some((nc) => nc.npcClassificationId === input.npcClassificationId)) {
    issues.push(
      `NPC classificatie met ID ${input.npcClassificationId} bestaat niet. Neem contact op met de beheerder.`,
    );
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
  const requestedSlug = String(formData.get("changeTypeSlug") ?? "portfolio_addition").trim();
  const access = await requirePermission(getChangeTypePermission(requestedSlug, "create"));
  if (!access.authorized) return { issues: [accessDeniedIssue(access)] };

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

  // Explicit client selection from the form, or derived from the portfolio
  // code prefix for backward compatibility with the legacy portfolio_addition form.
  const clientCode = await resolvePortfolioClientCode(input.data);

  // ── 2. Load change type config and reference data ──
  // The wizard is shared between the legacy portfolio_addition slug and the
  // explicit portfolio_configuration_create slug. Honor the slug the form was
  // opened with, defaulting to portfolio_addition for backward compatibility,
  // and fall back to the legacy slug when the explicit slug is not (yet) in
  // the change type catalog (see lib/change-type-resolution.ts).
  const changeTypeSlug = isPortfolioCreateWizardSlug(requestedSlug)
    ? await resolveChangeTypeSlugWithFallback(requestedSlug)
    : "portfolio_addition";

  const [changeTypeConfig, referenceData] = await Promise.all([
    getChangeTypeBySlug(changeTypeSlug),
    getClientConfigReferenceData(),
  ]);

  if (!changeTypeConfig) {
    return { issues: ["Change type \"Nieuwe portfolio toevoegen\" bestaat niet."] };
  }
  if (!changeTypeConfig.active) {
    return { issues: ["Change type \"Nieuwe portfolio toevoegen\" is gedeactiveerd voor nieuwe aanvragen."] };
  }

  const leadTimeError = validateEffectiveDate(input.data.effectiveDate, changeTypeConfig.defaultLeadDays);
  if (leadTimeError) return { issues: [leadTimeError] };

  const referenceIssues = await validatePortfolioAgainstReferenceData(input.data, referenceData);
  if (referenceIssues.length > 0) {
    return { issues: referenceIssues };
  }

  // Resolve asset class / sub asset class codes from reference data so that
  // values introduced by the governed change flow (new_asset_class /
  // new_sub_asset_class) are usable here immediately after apply, even
  // before lib/asset-classes.ts is updated in lockstep.
  const codes = lookupCodesFromReferenceData(input.data.assetClass, input.data.subAssetClass, referenceData);
  if (!codes) {
    return { issues: ["De combinatie van asset class en sub asset class is niet geldig."] };
  }

  const primaryAccountId = generatePrimaryAccountId(
    clientCode,
    codes.assetClassCode,
    codes.subAssetClassCode,
    input.data.managerCode,
  );

  // ── 3. Build IST/SOLL field pairs ──
  const fields: ChangeFieldValue[] = [
    { fieldKey: "portfolio_code", istValue: null, sollValue: input.data.portfolioCode },
    { fieldKey: "client_code", istValue: null, sollValue: clientCode },
    { fieldKey: "asset_class_code", istValue: null, sollValue: codes.assetClassCode },
    { fieldKey: "sub_asset_class_code", istValue: null, sollValue: codes.subAssetClassCode },
    { fieldKey: "manager_code", istValue: null, sollValue: input.data.managerCode },
    { fieldKey: "benchmark_code", istValue: null, sollValue: input.data.benchmarkCode },
    { fieldKey: "npc_classification_id", istValue: null, sollValue: String(input.data.npcClassificationId) },
    { fieldKey: "long_name", istValue: null, sollValue: input.data.longName },
    { fieldKey: "short_name", istValue: null, sollValue: input.data.shortName },
    { fieldKey: "primary_account_id", istValue: null, sollValue: primaryAccountId },
  ];

  // ── 4. Compute cost / lead time ──
  const estimate = buildChangeTypeEstimate(changeTypeConfig);

  // ── 5. Save ──
  const id = randomUUID();
  const reference = generateReference(changeTypeSlug);

  // Resolve a real `clients.id` so the change_requests.client_id FK is
  // satisfied (a random placeholder UUID violates it on a real database —
  // see #525 / t_d556c774). Fail closed when a database IS available but
  // no legacy clients row maps to the client code. The `?? id` placeholder
  // fallback remains ONLY for no-DB demo environments (e2e submits without
  // a database and expects the graceful "Database niet bereikbaar" path
  // from saveChangeRequest).
  const resolvedClientId = await getPublicClientIdByCode(clientCode);
  if (!resolvedClientId && sql) {
    return {
      issues: [
        `Klant "${clientCode}" is niet geregistreerd in de klantenadministratie. Neem contact op met de beheerder.`,
      ],
    };
  }
  const clientId = resolvedClientId ?? id;

  try {
    await saveChangeRequest({
      id,
      reference,
      changeType: changeTypeSlug,
      changeTypeId: changeTypeConfig.id,
      clientId, // primary_account_id is the operational key; use change request id as client id placeholder
      requestedBy: access.identity.displayName,
      rationale: input.data.rationale,
      effectiveDate: input.data.effectiveDate,
      items: [],
      fields,
      ...estimate,
      stakeholderAssignments: buildMandatoryStakeholderAssignments(changeTypeConfig),
    });

    await saveChangePortfolioConfiguration({
      changeRequestId: id,
      actionType: "CREATE",
      clientCode,
      portfolioCode: input.data.portfolioCode,
      assetClassCode: codes.assetClassCode,
      subAssetClassCode: codes.subAssetClassCode,
      managerCode: input.data.managerCode,
      benchmarkCode: input.data.benchmarkCode,
      npcClassificationId: input.data.npcClassificationId,
      longName: input.data.longName,
      shortName: input.data.shortName,
      activeInd: true,
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
