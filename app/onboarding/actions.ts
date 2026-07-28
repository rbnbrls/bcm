"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getChangeTypeBySlug, insertClient, createPortfolios, saveChangeRequest } from "@/lib/db";
import { generateReference } from "@/lib/change-form-utils";
import { ASSET_CLASSES } from "@/lib/types";
import { captureError } from "@/lib/sentry-helper";

export type OnboardingFormState = { message?: string; issues?: string[] };

/**
 * Server action for new customer onboarding.
 *
 * Validates the form, creates the client and portfolios,
 * records a change request, and redirects to the change detail page.
 */
export async function createCustomerOnboarding(
  _: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  // ── 1. Parse and validate form fields ──
  const input = z.object({
    customer_name: z.string().trim().min(2, "Klantnaam moet minimaal 2 tekens bevatten."),
    external_reference: z.string().trim().min(2, "Extern referentienummer moet minimaal 2 tekens bevatten."),
    regeling_type: z.enum(["FPR", "SPR"], { message: "Kies FPR (Flexibele Premieregeling) of SPR (Solidaire Premieregeling)." }),
    portfolio_count: z.coerce.number().int().min(1, "Kies minimaal 1 portfolio."),
    asset_class: z.enum(ASSET_CLASSES, { message: "Kies een geldige asset class." }),
    wtp_classification_id: z.string().uuid("Selecteer een geldige WTP classificatie."),
    asset_class_id: z.string().uuid("Selecteer een geldige asset class."),
    manager_id: z.string().uuid("Selecteer een geldige manager."),
    benchmark_id: z.string().uuid("Selecteer een geldige benchmark."),
  }).safeParse(Object.fromEntries(formData));

  if (!input.success) {
    return { issues: input.error.issues.map((issue) => issue.message) };
  }

  const { customer_name, external_reference, regeling_type, portfolio_count, asset_class,
    wtp_classification_id, asset_class_id, manager_id, benchmark_id } = input.data;

  // ── 2. Load change type config ──
  const config = await getChangeTypeBySlug("customer_onboarding");
  if (!config) {
    return { issues: ["Change type 'customer_onboarding' bestaat niet."] };
  }

  // ── 3. Create client in DB ──
  const clientId = randomUUID();
  try {
    await insertClient({
      id: clientId,
      name: customer_name,
      externalReference: external_reference,
      regelingType: regeling_type,
      assetClass: asset_class,
    });
  } catch (error) {
    captureError(error, { endpoint: "createCustomerOnboarding.insertClient", phase: "server_action" });
    const message = error instanceof Error ? error.message : "Klant kon niet worden aangemaakt.";
    if (message.includes("unique") || message.includes("duplicate") || message.includes("already exists")) {
      return { issues: [`Extern referentienummer "${external_reference}" bestaat al.`] };
    }
    return { issues: [message] };
  }

  // ── 4. Create portfolios ──
  let portfolios: Array<{ id: string; name: string; externalReference: string }> = [];
  try {
    portfolios = await createPortfolios({
      clientId,
      clientExternalReference: external_reference,
      count: portfolio_count,
      defaultBenchmarkId: "9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1", // MSCI World Net Return
      wtpClassificationId: wtp_classification_id,
      assetClassId: asset_class_id,
      managerId: manager_id,
      benchmarkGroupId: benchmark_id,
    });
  } catch (error) {
    captureError(error, { endpoint: "createCustomerOnboarding.createPortfolios", phase: "server_action" });
    const message = error instanceof Error ? error.message : "Portfolio's konden niet worden aangemaakt.";
    return { issues: [message] };
  }

  // ── 5. Create a change request to track the onboarding ──
  const changeId = randomUUID();
  const reference = generateReference("customer_onboarding");

  try {
    await saveChangeRequest({
      id: changeId,
      reference,
      changeType: "customer_onboarding",
      changeTypeId: config.id,
      clientId,
      requestedBy: "Systeem",
      rationale: `Nieuwe klant: ${customer_name} (${regeling_type}) — ${portfolio_count} portfolio('s)`,
      effectiveDate: new Date().toISOString().split("T")[0],
      items: [],
      fields: [
        { fieldKey: "customer_name", istValue: customer_name, sollValue: customer_name },
        { fieldKey: "external_reference", istValue: external_reference, sollValue: external_reference },
        { fieldKey: "regeling_type", istValue: regeling_type, sollValue: regeling_type },
        { fieldKey: "portfolio_count", istValue: portfolio_count, sollValue: portfolio_count },
        { fieldKey: "asset_class", istValue: asset_class, sollValue: asset_class },
      ],
      estimatedCost: 0,
      estimatedCostCurrency: "EUR",
      estimatedLeadDays: 1,
      stakeholderAssignments: config.stakeholders
        .filter((s) => s.mandatory)
        .map((s) => ({
          stakeholderId: s.id,
          contact: `${s.id}@bcm.example.com`,
          notifiedAt: null,
        })),
    });
  } catch (error) {
    captureError(error, { endpoint: "createCustomerOnboarding.saveChangeRequest", phase: "server_action" });
    const message = error instanceof Error ? error.message : "De change kon niet worden opgeslagen.";
    return { issues: [message] };
  }

  // ── 6. Redirect to the change detail page ──
  redirect(`/changes/${changeId}`);
}
