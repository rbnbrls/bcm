"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getClientConfigs, getChangeTypeBySlug, getBenchmarks, saveChangeRequest } from "@/lib/db";
import type { ChangeFieldValue } from "@/lib/types";
import { buildFieldValuesFromFormData, validateGenericFields, computeEstimatedCost, generateReference, getTodayDateString } from "@/lib/change-form-utils";
import { captureError } from "@/lib/sentry-helper";

export type GenericFormState = { message?: string; issues?: string[] };

/**
 * Generic change request server action.
 *
 * Accepts any change type slug from the form, loads the config,
 * validates dynamic fields, and creates the change request.
 *
 * Form fields:
 * - changeTypeSlug: string (identifies which change type config to use)
 * - clientId: UUID
 * - requestedBy: string
 * - rationale: string (min 10 chars)
 * - effectiveDate: ISO date string
 * - Dynamic fields per ChangeTypeConfig.fields
 */
export async function createGenericChangeRequest(
  _: GenericFormState,
  formData: FormData,
): Promise<GenericFormState> {
  // ── 1. Parse standard fields ──
  const changeTypeSlug = String(formData.get("changeTypeSlug") ?? "").trim();
  if (!changeTypeSlug) return { issues: ["Change type is niet geselecteerd."] };

  const input = z.object({
    clientId: z.string().uuid("Selecteer een geldige klant."),
    requestedBy: z.string().trim().min(2, "Vul de naam van de aanvrager in."),
    rationale: z.string().trim().min(10, "Licht de reden van de wijziging in minimaal 10 tekens toe."),
    effectiveDate: z.string().date("Kies een geldige ingangsdatum."),
  }).safeParse(Object.fromEntries(formData));

  if (!input.success) return { issues: input.error.issues.map((issue) => issue.message) };

  const todayLocal = getTodayDateString();
  if (input.data.effectiveDate < todayLocal) return { issues: ["De ingangsdatum mag niet in het verleden liggen."] };

  // ── 2. Load change type config ──
  const changeTypeConfig = await getChangeTypeBySlug(changeTypeSlug);
  if (!changeTypeConfig) return { issues: [`Change type "${changeTypeSlug}" bestaat niet.`] };

  // ── 3. Load client and validate ──
  const clients = await getClientConfigs();
  const client = clients.find((c) => c.id === input.data.clientId);
  if (!client) return { issues: ["De gekozen klant bestaat niet in de client config."] };

  // ── 4. Extract dynamic field values from form ──
  const fieldValues = buildFieldValuesFromFormData(changeTypeConfig, formData);

  // ── 5. Validate dynamic fields ──
  const validation = validateGenericFields(changeTypeConfig, fieldValues);
  if (!validation.valid) {
    return { issues: Object.values(validation.errors) };
  }

  // ── 5b. Validate referenceTable fields against the selected client ──
  const portfolioIssues: string[] = [];
  for (const field of changeTypeConfig.fields) {
    if (field.referenceTable === "portfolios") {
      const portfolioId = String(fieldValues[field.key] ?? "");
      if (portfolioId && !client.portfolios.some((p) => p.id === portfolioId)) {
        portfolioIssues.push(`${field.label}: de gekozen portefeuille hoort niet bij ${client.name}.`);
      }
    }
  }
  if (portfolioIssues.length > 0) {
    return { issues: portfolioIssues };
  }

  // ── 5c. Validate benchmark_catalog reference fields ──
  const benchmarks = await getBenchmarks();
  const benchmarkIssues: string[] = [];
  for (const field of changeTypeConfig.fields) {
    if (field.type === "benchmark" || field.referenceTable === "benchmark_catalog") {
      const benchmarkId = String(fieldValues[field.key] ?? "");
      if (benchmarkId && !benchmarks.some((b) => b.id === benchmarkId)) {
        benchmarkIssues.push(`${field.label}: de gekozen benchmark bestaat niet in de catalogus.`);
      }
    }
  }
  if (benchmarkIssues.length > 0) {
    return { issues: benchmarkIssues };
  }

  // ── 6. Compute cost ──
  // Count items: either from explicit items array, or 1 for single-portfolio changes
  const itemCount = 1; // default: single change item
  const cost = computeEstimatedCost(changeTypeConfig, itemCount);

  // ── 7. Build IST/SOLL field pairs ──
  const fields: ChangeFieldValue[] = [];
  const mappedKeys = new Set<string>();

  // Use istSollMapping to build explicit IST/SOLL pairs
  if (changeTypeConfig.istSollMapping && changeTypeConfig.istSollMapping.length > 0) {
    for (const mapping of changeTypeConfig.istSollMapping) {
      fields.push({
        fieldKey: mapping.soll,
        istValue: fieldValues[mapping.ist] ?? null,
        sollValue: fieldValues[mapping.soll] ?? null,
      });
      mappedKeys.add(mapping.ist);
      mappedKeys.add(mapping.soll);
    }
  }

  // Add remaining unmapped fields
  for (const field of changeTypeConfig.fields) {
    if (!mappedKeys.has(field.key)) {
      const value = fieldValues[field.key] ?? null;
      fields.push({
        fieldKey: field.key,
        istValue: value,
        sollValue: value,
      });
      mappedKeys.add(field.key);
    }
  }

  // ── 8. Save ──
  const id = randomUUID();
  const reference = generateReference(changeTypeSlug);

  try {
    await saveChangeRequest({
      id,
      reference,
      changeType: changeTypeSlug,
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
      // Include default stakeholder assignments
      stakeholderAssignments: changeTypeConfig.stakeholders
        .filter((s) => s.mandatory)
        .map((s) => ({
          stakeholderId: s.id,
          contact: `${s.id}@bcm.example.com`,
          notifiedAt: null,
        })),
    });
  } catch (error) {
    captureError(error, { endpoint: "createGenericChangeRequest", phase: "server_action" });
    const message = error instanceof Error ? error.message : "De change kon niet worden opgeslagen.";
    return { issues: [message] };
  }

  redirect(`/changes/${id}`);
}
