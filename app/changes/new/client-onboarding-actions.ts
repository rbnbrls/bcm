"use server";

import { z } from "zod";
import { getClientConfigReferenceData } from "@/lib/client-config-db";

export type ClientOnboardingFormState = { message?: string; issues?: string[] };

/**
 * Server action for the client onboarding wizard.
 *
 * Validates the staged wizard payload (required + format rules mirroring the
 * client_config CHECK constraints) and resolves the selected asset class
 * against the reference data.
 *
 * NOTE (t_7b540257): the actual submission — packaging the collected client +
 * portfolio data into a change request payload with complete IST/SOLL fields,
 * staging it, and redirecting to the change detail page — is wired by the
 * follow-up task. This action currently validates and returns a success
 * message so the wizard flow is complete end-to-end; the child task replaces
 * the success branch with the real staging + redirect.
 */
export async function createClientOnboardingChange(
  _: ClientOnboardingFormState,
  formData: FormData,
): Promise<ClientOnboardingFormState> {
  // ── 1. Parse and validate form fields (required + format) ──
  const input = z.object({
    clientCode: z
      .string()
      .trim()
      .min(1, "Klantcode is verplicht.")
      .regex(/^[A-Z0-9]{1,3}$/, "Klantcode bestaat uit 1-3 hoofdletters of cijfers."),
    clientName: z.string().trim().min(2, "Klantnaam moet minimaal 2 tekens bevatten.").max(100),
    portfolioName: z.string().trim().min(2, "Portefeuillenaam moet minimaal 2 tekens bevatten.").max(100),
    portfolioCode: z
      .string()
      .trim()
      .min(2, "Portefeuillecode is verplicht.")
      .regex(/^[A-Z0-9]{2,15}$/, "Portefeuillecode bestaat uit 2-15 hoofdletters of cijfers."),
    assetClassCode: z.string().trim().min(1, "Kies een asset class."),
    allocationPercentage: z.coerce
      .number()
      .finite("Allocatiepercentage moet een getal zijn.")
      .min(0, "Allocatiepercentage moet minimaal 0 zijn.")
      .max(100, "Allocatiepercentage mag maximaal 100 zijn."),
  }).safeParse(Object.fromEntries(formData));

  if (!input.success) {
    return { issues: input.error.issues.map((issue) => issue.message) };
  }

  const data = input.data;

  // ── 2. Resolve asset class against reference data ──
  const referenceData = await getClientConfigReferenceData();
  const assetClass = referenceData.assetClasses.find((ac) => ac.assetClassCode === data.assetClassCode);
  if (!assetClass) {
    return {
      issues: [
        `Asset class "${data.assetClassCode}" bestaat niet in de referentiedata. ` +
          "Een nieuwe asset class kan via het change proces worden aangevraagd.",
      ],
    };
  }

  // TODO(t_7b540257): package data into a change request payload with complete
  // IST/SOLL fields, stage the onboarding (client + portfolio + first config
  // row) and redirect to the change detail page.
  return {
    message: `Onboarding-aanvraag voor klant "${data.clientCode} — ${data.clientName}" is klaargezet.`,
  };
}
