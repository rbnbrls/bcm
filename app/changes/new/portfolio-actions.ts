"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getClientConfigs, getChangeTypeBySlug, saveChangeRequest } from "@/lib/db";
import type { ChangeFieldValue } from "@/lib/types";
import { computeEstimatedCost, generateReference, getTodayDateString } from "@/lib/change-form-utils";
import { captureError } from "@/lib/sentry-helper";

export type PortfolioFormState = { message?: string; issues?: string[] };

const portfolioSchema = z.object({
  clientId: z.string().uuid("Selecteer een geldige klant."),
  name: z.string().trim().min(2, "Portefeuillenaam moet minimaal 2 tekens bevatten.").max(100),
  externalReference: z.string().trim().min(2, "Externe referentie moet minimaal 2 tekens bevatten.").max(50),
  currentBenchmarkId: z.string().uuid("Selecteer een geldige benchmark."),
  currency: z.string().optional().default("EUR"),
  wtpClassificationId: z.string().uuid("Selecteer een geldige WTP classificatie."),
  assetClassRowId: z.string().uuid("Selecteer een geldige asset class."),
  managerId: z.string().uuid("Selecteer een geldige manager."),
  benchmarkGroupId: z.string().uuid("Selecteer een geldige benchmark groep."),
  assetClass: z.string().min(1, "Selecteer een geldige AC."),
  subAssetClass: z.string().min(1, "Vul een Sub AC in."),
  requestedBy: z.string().trim().min(2, "Vul de naam van de aanvrager in."),
  rationale: z.string().trim().min(10, "Licht de reden van de wijziging in minimaal 10 tekens toe."),
  effectiveDate: z.string().date("Kies een geldige ingangsdatum."),
});

/**
 * Server action for creating a portfolio_addition change request.
 *
 * Collects all 11 portfolio fields plus request metadata, validates,
 * and creates the change request via the generic pipeline.
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

  // ── 2. Load change type config ──
  const changeTypeConfig = await getChangeTypeBySlug("portfolio_addition");
  if (!changeTypeConfig) {
    return { issues: ["Change type \"Nieuwe portfolio toevoegen\" bestaat niet."] };
  }

  // ── 3. Validate client exists ──
  const clients = await getClientConfigs();
  const client = clients.find((c) => c.id === input.data.clientId);
  if (!client) {
    return { issues: ["De gekozen klant bestaat niet in de client config."] };
  }

  // ── 4. Build IST/SOLL field pairs ──
  const fields: ChangeFieldValue[] = [
    { fieldKey: "client_id", istValue: null, sollValue: input.data.clientId },
    { fieldKey: "name", istValue: null, sollValue: input.data.name },
    { fieldKey: "external_reference", istValue: null, sollValue: input.data.externalReference },
    { fieldKey: "current_benchmark_id", istValue: null, sollValue: input.data.currentBenchmarkId },
    { fieldKey: "currency", istValue: null, sollValue: input.data.currency },
    { fieldKey: "wtp_classification_id", istValue: null, sollValue: input.data.wtpClassificationId },
    { fieldKey: "asset_class_id", istValue: null, sollValue: input.data.assetClassRowId },
    { fieldKey: "manager_id", istValue: null, sollValue: input.data.managerId },
    { fieldKey: "benchmark_id", istValue: null, sollValue: input.data.benchmarkGroupId },
    { fieldKey: "asset_class", istValue: null, sollValue: input.data.assetClass },
    { fieldKey: "sub_asset_class", istValue: null, sollValue: input.data.subAssetClass },
  ];

  // ── 5. Compute cost ──
  const cost = computeEstimatedCost(changeTypeConfig, 1);

  // ── 6. Save ──
  const id = randomUUID();
  const reference = generateReference("portfolio_addition");

  try {
    await saveChangeRequest({
      id,
      reference,
      changeType: "portfolio_addition",
      changeTypeId: changeTypeConfig.id,
      clientId: input.data.clientId,
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
  } catch (error) {
    captureError(error, { endpoint: "createPortfolioAdditionChange", phase: "server_action" });
    const message = error instanceof Error ? error.message : "De change kon niet worden opgeslagen.";
    return { issues: [message] };
  }

  redirect(`/changes/${id}`);
}
