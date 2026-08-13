"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getClientConfigs, getChangeTypeBySlug, getChangeTypeById, getBenchmarks, saveChangeRequest } from "@/lib/db";
import type { ChangeFieldValue } from "@/lib/types";
import { buildFieldValuesFromFormData, validateGenericFields, generateReference, getTodayDateString, validateEffectiveDate } from "@/lib/change-form-utils";
import { reportError } from "@/lib/error-reporter";
import { buildChangeTypeEstimate, buildMandatoryStakeholderAssignments } from "@/lib/change-types/request";
import { accessDeniedIssue, requirePermission } from "@/lib/rbac-request";
import { getChangeTypePermission } from "@/lib/change-type-registry";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { compareLegacyChangeWithWorkflowShadow } from "@/lib/workflow-studio";

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
  const changeTypeSlug = String(formData.get("changeTypeSlug") ?? "").trim();
  const access = await requirePermission(getChangeTypePermission(changeTypeSlug, "create"));
  if (!access.authorized) return { issues: [accessDeniedIssue(access)] };

  // ── 1. Parse standard fields ──
  if (!changeTypeSlug) return { issues: ["Change type is niet geselecteerd."] };

  // Lookup-addition change types used to have dedicated request forms that
  // staged the value in change_lookup_request. Those forms were removed — all
  // changes are now created via the Workflow Studio change catalog. Submitting
  // them via the generic form would create a change without a staged value, so
  // the apply step could never introduce the new lookup. Block and redirect.
  if (changeTypeSlug === "new_asset_class" || changeTypeSlug === "new_sub_asset_class") {
    return {
      issues: [
        changeTypeSlug === "new_asset_class"
          ? "Nieuwe asset classes worden aangevraagd via de change catalog (Workflow Studio)."
          : "Nieuwe sub asset classes worden aangevraagd via de change catalog (Workflow Studio).",
      ],
    };
  }

  const input = z.object({
    clientId: z.string().uuid("Selecteer een geldige klant."),
    requestedBy: z.string().trim().min(2, "Vul de naam van de aanvrager in."),
    rationale: z.string().trim().min(10, "Licht de reden van de wijziging in minimaal 10 tekens toe."),
    effectiveDate: z.string().date("Kies een geldige ingangsdatum."),
  }).safeParse(Object.fromEntries(formData));

  if (!input.success) return { issues: input.error.issues.map((issue) => issue.message) };

  const todayLocal = getTodayDateString();
  if (input.data.effectiveDate < todayLocal) return { issues: ["De ingangsdatum mag niet in het verleden liggen."] };

  // ── 2-8. All DB-dependent operations in a single catch-all ──
  const id = randomUUID();
  const reference = generateReference(changeTypeSlug);

  try {
    // ── 2. Load change type config ──
    const changeTypeConfig = await getChangeTypeBySlug(changeTypeSlug);
    if (!changeTypeConfig) return { issues: [`Change type "${changeTypeSlug}" bestaat niet.`] };
    if (!changeTypeConfig.active) {
      return { issues: [`Change type "${changeTypeConfig.name}" is gedeactiveerd voor nieuwe aanvragen.`] };
    }

    // ── 2a. Validate effective date against lead time ──
    const leadTimeError = validateEffectiveDate(input.data.effectiveDate, changeTypeConfig.defaultLeadDays);
    if (leadTimeError) return { issues: [leadTimeError] };

    // ── 2b. Strict confirm the config ID exists in the DB ──
    // getChangeTypeBySlug falls back to in-memory defaults when the DB
    // has no matching row, but downstream operations (saveChangeRequest)
    // need a real DB record. A strict DB-only check catches this gap.
    if (!(await getChangeTypeById(changeTypeConfig.id, true))) {
      return {
        issues: [
          `Change type config met ID "${changeTypeConfig.id}" bestaat niet in de database. Neem contact op met de beheerder.`,
        ],
      };
    }

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

    // ── 6. Compute cost / lead time ──
    const estimate = buildChangeTypeEstimate(changeTypeConfig);

    // ── 7. Build IST/SOLL field pairs ──
    const fields: ChangeFieldValue[] = [];
    const mappedKeys = new Set<string>();

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
    await saveChangeRequest({
      id,
      reference,
      changeType: changeTypeSlug,
      changeTypeId: changeTypeConfig.id,
      clientId: input.data.clientId,
      requestedBy: access.identity.displayName,
      rationale: input.data.rationale,
      effectiveDate: input.data.effectiveDate,
      items: [],
      fields,
      ...estimate,
      stakeholderAssignments: buildMandatoryStakeholderAssignments(changeTypeConfig),
    });

    if (changeTypeSlug === "fee_change" && isFeatureEnabled("workflow_runtime.shadow_compare")) {
      try {
        const shadow = compareLegacyChangeWithWorkflowShadow({
          identity: access.identity,
          config: changeTypeConfig,
          scope: {
            tenant: access.identity.tenant ?? "unknown",
            businessUnit: access.identity.businessUnit ?? "unknown",
            clientIds: [input.data.clientId],
          },
          formValues: {
            ...fieldValues,
            effective_date: input.data.effectiveDate,
            rationale: input.data.rationale,
          },
          fieldPairs: fields,
          effectiveDate: input.data.effectiveDate,
          rationale: input.data.rationale,
          classicApplyPlan: {
            resourceId: "legacy_ist_sync",
            operation: "UPDATE",
            attributes: fields
              .filter((field) => !Object.is(field.istValue, field.sollValue))
              .map((field) => ({ attributeId: field.fieldKey, ist: field.istValue, soll: field.sollValue })),
          },
        });
        if (shadow.status === "mismatch") {
          await reportError(new Error("Workflow runtime shadow mismatch: fee_change"), {
            action: "workflow-runtime-shadow-compare",
            userMessage: "Shadowvergelijking wijkt af; klassieke aanvraag blijft leidend.",
            tags: { changeTypeSlug, changeRequestId: id, shadowStatus: shadow.status },
          });
        }
      } catch (shadowError) {
        await reportError(shadowError, {
          action: "workflow-runtime-shadow-compare",
          userMessage: "Shadowvergelijking kon niet worden uitgevoerd; klassieke aanvraag blijft leidend.",
          tags: { changeTypeSlug, changeRequestId: id },
        });
      }
    }
  } catch (error) {
    await reportError(error, {
      action: "create-generic-change",
      userMessage: "De change kon niet worden opgeslagen.",
      tags: {
        requestedBy: access.identity.displayName,
        changeTypeSlug,
        timestamp: new Date().toISOString(),
      },
    });
    const message = error instanceof Error ? error.message : "De change kon niet worden opgeslagen.";
    return { issues: [message] };
  }

  redirect(`/changes/${id}`);
}
