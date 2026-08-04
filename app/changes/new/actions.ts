"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getChangeTypeBySlug, getPublicClientIdByCode, saveChangeRequest } from "@/lib/db";
import {
  getBenchmarkSwitchPortfolioOptions,
  getClientConfigReferenceData,
  getConflictingClientConfigPrimaryAccountIds,
  stageChangePortfolioConfiguration,
} from "@/lib/client-config-db";
import { generateReference, getTodayDateString, validateEffectiveDate } from "@/lib/change-form-utils";
import { reportError } from "@/lib/error-reporter";
import { buildChangeTypeEstimate, buildMandatoryStakeholderAssignments } from "@/lib/change-types/request";
import type { ChangeFieldValue } from "@/lib/types";
import { accessDeniedIssue, requirePermission } from "@/lib/rbac-request";

export type FormState = { message?: string; issues?: string[] };

const benchmarkSwitchSchema = z.object({
  clientCode: z.string().trim().regex(/^[A-Z0-9]{1,3}$/, "Selecteer een bestaande klant."),
  primaryAccountId: z.string().trim().min(3, "Selecteer een bestaande portefeuille."),
  requestedBenchmarkCode: z.string().trim().min(1, "Selecteer een bestaande SOLL-benchmark."),
  requestedBy: z.string().trim().min(2, "Vul de naam van de aanvrager in."),
  rationale: z.string().trim().min(10, "Licht de reden van de wijziging in minimaal 10 tekens toe."),
  effectiveDate: z.string().date("Kies een geldige ingangsdatum."),
});

export async function createBenchmarkChange(_: FormState, formData: FormData): Promise<FormState> {
  const access = await requirePermission("changes:create");
  if (!access.authorized) return { issues: [accessDeniedIssue(access)] };

  const input = benchmarkSwitchSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { issues: input.error.issues.map((issue) => issue.message) };

  const clientCode = input.data.clientCode.toUpperCase();
  const primaryAccountId = input.data.primaryAccountId.toUpperCase();
  const requestedBenchmarkCode = input.data.requestedBenchmarkCode.toUpperCase();

  const todayLocal = getTodayDateString();
  if (input.data.effectiveDate < todayLocal) return { issues: ["De ingangsdatum mag niet in het verleden liggen."] };

  const [changeTypeConfig, referenceData, portfolioOptions] = await Promise.all([
    getChangeTypeBySlug("benchmark_switch"),
    getClientConfigReferenceData(),
    getBenchmarkSwitchPortfolioOptions(),
  ]);

  if (!changeTypeConfig) {
    return { issues: ["Change type \"benchmark_switch\" is niet geconfigureerd. Neem contact op met de beheerder."] };
  }
  if (!changeTypeConfig.active) {
    return { issues: ["Change type \"Benchmarkwissel\" is gedeactiveerd voor nieuwe aanvragen."] };
  }

  const leadTimeError = validateEffectiveDate(input.data.effectiveDate, changeTypeConfig.defaultLeadDays);
  if (leadTimeError) return { issues: [leadTimeError] };

  if (!referenceData.clients.some((client) => client.clientCode === clientCode)) {
    return { issues: [`Klant "${clientCode}" bestaat niet in client_config.`] };
  }

  const currentRow = portfolioOptions.find((row) => row.primaryAccountId === primaryAccountId);
  if (!currentRow) {
    return { issues: ["De gekozen portefeuilleconfiguratie bestaat niet of is niet actief."] };
  }
  if (currentRow.clientCode !== clientCode) {
    return { issues: [`De gekozen portefeuille hoort niet bij klant "${clientCode}".`] };
  }
  if (currentRow.benchmarkCode === requestedBenchmarkCode) {
    return { issues: ["De SOLL-benchmark moet verschillen van de huidige IST-benchmark."] };
  }

  const requestedBenchmark = referenceData.benchmarks.find((benchmark) => benchmark.benchmarkCode === requestedBenchmarkCode);
  if (!requestedBenchmark) {
    return { issues: [`Benchmark "${requestedBenchmarkCode}" bestaat niet in client_config.benchmark.`] };
  }

  const conflicting = await getConflictingClientConfigPrimaryAccountIds([primaryAccountId]);
  if (conflicting.has(primaryAccountId)) {
    return { issues: [`Voor ${currentRow.portfolioCode} loopt al een openstaande configuratiewijziging.`] };
  }

  const id = randomUUID();
  const reference = generateReference("benchmark_switch");
  const estimate = buildChangeTypeEstimate(changeTypeConfig, 1);
  const fields: ChangeFieldValue[] = [
    { fieldKey: "client_code", istValue: currentRow.clientCode, sollValue: currentRow.clientCode },
    { fieldKey: "portfolio_code", istValue: currentRow.portfolioCode, sollValue: currentRow.portfolioCode },
    { fieldKey: "primary_account_id", istValue: currentRow.primaryAccountId, sollValue: currentRow.primaryAccountId },
    { fieldKey: "benchmark_code", istValue: currentRow.benchmarkCode, sollValue: requestedBenchmark.benchmarkCode },
    { fieldKey: "action_type", istValue: "UPDATE", sollValue: "UPDATE" },
  ];
  const clientId = (await getPublicClientIdByCode(currentRow.clientCode)) ?? id;

  try {
    await saveChangeRequest({
      id,
      reference,
      changeType: "benchmark_switch",
      changeTypeId: changeTypeConfig.id,
      clientId,
      requestedBy: input.data.requestedBy,
      rationale: input.data.rationale,
      effectiveDate: input.data.effectiveDate,
      items: [],
      fields,
      ...estimate,
      stakeholderAssignments: buildMandatoryStakeholderAssignments(changeTypeConfig),
    });

    const staged = await stageChangePortfolioConfiguration({
      changeRequestId: id,
      actionType: "UPDATE",
      targetPrimaryAccountId: currentRow.primaryAccountId,
      clientCode: currentRow.clientCode,
      portfolioCode: currentRow.portfolioCode,
      assetClassCode: currentRow.assetClassCode,
      subAssetClassCode: currentRow.subAssetClassCode,
      managerCode: currentRow.managerCode,
      benchmarkCode: requestedBenchmark.benchmarkCode,
      npcClassificationId: currentRow.npcClassificationId,
      longName: currentRow.longName,
      shortName: currentRow.shortName,
      effectiveFrom: input.data.effectiveDate,
      effectiveUntil: null,
    });
    if (!staged.ok) return { issues: staged.issues };
  } catch (error) {
    await reportError(error, { action: "create-benchmark-change" });
    const message = error instanceof Error ? error.message : "De change kon niet worden opgeslagen.";
    if (message.includes("foreign key constraint") || message.includes("violates foreign key")) {
      return { issues: ["Er is een inconsistentie in de database. Ververs de pagina en probeer het opnieuw."] };
    }
    return { issues: [message] };
  }
  redirect(`/changes/${id}`);
}
