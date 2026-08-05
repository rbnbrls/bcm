"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getClientConfigReferenceData, stagePortfolioMetadataChange } from "@/lib/client-config-db";
import {
  getChangeTypeBySlug,
  getPublicClientIdByCode,
  saveChangeRequest,
  sql,
} from "@/lib/db";
import { generateReference, getTodayDateString } from "@/lib/change-form-utils";
import { reportError } from "@/lib/error-reporter";
import type { ChangeFieldValue } from "@/lib/types";
import { PARENT_ACCOUNT_CODE_PATTERN } from "@/lib/validation-rules";
import { buildChangeTypeEstimate, buildMandatoryStakeholderAssignments } from "@/lib/change-types/request";
import { accessDeniedIssue, requirePermission } from "@/lib/rbac-request";
import { getChangeTypePermission } from "@/lib/change-type-registry";

export type ClientOnboardingFormState = { message?: string; issues?: string[] };

/**
 * Server action for the client onboarding wizard.
 *
 * Validates the staged wizard payload (required + format rules mirroring the
 * client_config CHECK constraints), resolves the selected asset class against
 * the reference data, and — on the final step — creates the change request:
 *
 *   1. Loads the `client_onboarding` change type config (strict DB confirm,
 *      like the generic change action).
 *   2. Packages the collected fields (client, portfolio, asset class,
 *      allocation, optional parent-account metadata) into IST/SOLL field pairs
 *      for audit. Because onboarding introduces a genuinely NEW client,
 *      nothing exists yet: IST is null and SOLL carries the submitted value
 *      (CREATE semantics, matching the portfolio addition action).
 *   3. Resolves a real `clients.id` for the change_requests.client_id FK
 *      (t_1b31ea3a): existing PF-<CODE>-% rows are reused, otherwise a minimal
 *      placeholder row is created so the change request can reference the new
 *      client. Falls back to the change-request id placeholder only in
 *      demo/mocked envs without a database.
 *   4. Persists the change request via saveChangeRequest (status 'submitted').
 *   5. Stages portfolio + parent-account metadata through the governed
 *      staging helper `stagePortfolioMetadataChange` (task t_4fbdd465):
 *        - portfolio CREATE is always staged (onboarding introduces a new
 *          portfolio_code). When the submitted parentAccountCode already
 *          exists as an ACTIVE parent account, it is linked on the portfolio
 *          row (orphan prevention).
 *        - parent_account CREATE is staged only when a parentAccountCode is
 *          provided that does not yet exist (a brand-new parent account).
 *      Validation issues from the staging helper (duplicate codes, format,
 *      orphan prevention) are returned to the form as `.issues` so the user
 *      sees the exact Dutch errors.
 *   6. Redirects to the change detail page.
 *
 * The change request with its IST/SOLL fields IS the staged onboarding data
 * for audit; the client_config apply step runs later when the change reaches
 * 'processed' (see lib/change-processor.ts + lib/onboarding-staging-db.ts).
 */
export async function createClientOnboardingChange(
  _: ClientOnboardingFormState,
  formData: FormData,
): Promise<ClientOnboardingFormState> {
  const access = await requirePermission(getChangeTypePermission("client_onboarding", "create"));
  if (!access.authorized) return { issues: [accessDeniedIssue(access)] };

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
    allocationPercentage: z
      .string()
      .trim()
      .min(1, "Allocatiepercentage is verplicht.")
      .refine((value) => {
        const n = Number(value);
        return Number.isFinite(n) && n >= 0 && n <= 100;
      }, "Allocatiepercentage moet tussen 0 en 100 liggen."),
    parentAccountCode: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ?? "").trim())
      .refine(
        (v) => v === "" || (v.length <= 16 && PARENT_ACCOUNT_CODE_PATTERN.test(v)),
        "Ouderaccount code bestaat uit hoofdletters, cijfers en underscores (bijv. ADP_MAIN).",
      ),
    msaParentAccountCode: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ?? "").trim())
      .refine(
        (v) => v === "" || (v.length <= 16 && PARENT_ACCOUNT_CODE_PATTERN.test(v)),
        "MSA code bestaat uit hoofdletters, cijfers en underscores (bijv. ADP_MSA_01).",
      ),
  }).safeParse(Object.fromEntries(formData));

  if (!input.success) {
    return { issues: input.error.issues.map((issue) => issue.message) };
  }

  const data = input.data;
  const parentAccountCode = data.parentAccountCode?.trim().toUpperCase() || null;
  const msaParentAccountCode = data.msaParentAccountCode?.trim().toUpperCase() || null;

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

  // Does the submitted parent-account code already exist as an ACTIVE row?
  // A link is only possible to an existing parent account (orphan prevention);
  // a brand-new code is created through its own parent_account CREATE staging row.
  const parentAccountExists = parentAccountCode
    ? referenceData.parentAccounts.some(
        (pa) => pa.parentAccountCode === parentAccountCode && pa.activeInd,
      )
    : false;

  // ── 3. Load change type config (slug lookup, like portfolio-actions) ──
  const changeTypeConfig = await getChangeTypeBySlug("client_onboarding");
  if (!changeTypeConfig) {
    return { issues: [`Change type "client_onboarding" bestaat niet.`] };
  }
  if (!changeTypeConfig.active) {
    return { issues: [`Change type "${changeTypeConfig.name}" is gedeactiveerd voor nieuwe aanvragen.`] };
  }
  // NOTE: no separate strict getChangeTypeById() confirm here. saveChangeRequest
  // validates the config row itself (SELECT 1 FROM change_type_config WHERE
  // id = ...) and throws a clear error when the config is genuinely missing.
  // getChangeTypeBySlug also merges canonical field/stakeholder definitions
  // when the seeded row leaves them empty, so the mandatory stakeholders
  // below are always populated.

  // ── 4. Build IST/SOLL field pairs (CREATE: IST null, SOLL = new value) ──
  const fields: ChangeFieldValue[] = [
    { fieldKey: "client_code", istValue: null, sollValue: data.clientCode },
    { fieldKey: "client_name", istValue: null, sollValue: data.clientName },
    { fieldKey: "portfolio_name", istValue: null, sollValue: data.portfolioName },
    { fieldKey: "portfolio_code", istValue: null, sollValue: data.portfolioCode },
    { fieldKey: "asset_class_code", istValue: null, sollValue: assetClass.assetClassCode },
    { fieldKey: "allocation_percentage", istValue: null, sollValue: String(data.allocationPercentage) },
  ];
  if (parentAccountCode) {
    fields.push({ fieldKey: "parent_account_code", istValue: null, sollValue: parentAccountCode });
  }
  if (msaParentAccountCode) {
    fields.push({ fieldKey: "msa_parent_account_code", istValue: null, sollValue: msaParentAccountCode });
  }

  // ── 5. Compute cost / lead time (client onboarding is free by config) ──
  const estimate = buildChangeTypeEstimate(changeTypeConfig);

  // ── 6. Persist the change request and redirect ──
  const id = randomUUID();
  const reference = generateReference("client_onboarding");
  const clientId = (await resolveOnboardingClientId(data.clientCode, data.clientName)) ?? id;

  try {
    await saveChangeRequest({
      id,
      reference,
      changeType: "client_onboarding",
      changeTypeId: changeTypeConfig.id,
      clientId,
      requestedBy: "Systeem",
      rationale: `Nieuwe klant: ${data.clientName} (${data.clientCode}) — eerste portefeuille ${data.portfolioName} (${data.portfolioCode}).`,
      effectiveDate: getTodayDateString(),
      items: [],
      fields,
      ...estimate,
      stakeholderAssignments: buildMandatoryStakeholderAssignments(changeTypeConfig),
    });
  } catch (error) {
    await reportError(error, { action: "create-client-onboarding-change" });
    const message = error instanceof Error ? error.message : "De change kon niet worden opgeslagen.";
    return { issues: [message] };
  }

  // ── 7. Stage portfolio + parent-account metadata via the governed helper ──
  const stagingIssues: string[] = [];

  // 7a. parent_account CREATE — only when a brand-new parent account is requested.
  if (parentAccountCode && !parentAccountExists) {
    const result = await stagePortfolioMetadataChange({
      changeRequestId: id,
      dimension: "parent_account",
      actionType: "CREATE",
      code: parentAccountCode,
      msaParentAccountCode,
    });
    if (!result.ok) stagingIssues.push(...result.issues);
  }

  // 7b. portfolio CREATE — always (the onboarding introduces a new portfolio).
  //     Linked to the parent account only when it already exists (the shared
  //     validation rejects links to not-yet-existing parent accounts).
  const portfolioResult = await stagePortfolioMetadataChange({
    changeRequestId: id,
    dimension: "portfolio",
    actionType: "CREATE",
    code: data.portfolioCode,
    parentAccountCode: parentAccountExists ? parentAccountCode : null,
  });
  if (!portfolioResult.ok) stagingIssues.push(...portfolioResult.issues);

  if (stagingIssues.length > 0) {
    return { issues: stagingIssues };
  }

  redirect(`/changes/${id}`);
}

/**
 * Resolve a real public `clients.id` for the change request FK.
 *
 * Onboarding introduces a genuinely new client: when no legacy PF-<CODE>-%
 * clients row exists yet, a minimal placeholder row is created so the
 * change_requests.client_id FK is satisfied and the change detail page can
 * render the new client's identity. Returns null only when no database is
 * available (demo/mocked envs) — the caller then falls back to the
 * change-request id placeholder, matching the established pattern in the
 * portfolio/admin actions.
 */
async function resolveOnboardingClientId(
  clientCode: string,
  clientName: string,
): Promise<string | null> {
  const existing = await getPublicClientIdByCode(clientCode);
  if (existing) return existing;
  if (!sql) return null;

  const id = randomUUID();
  try {
    const inserted = await sql!`
      INSERT INTO clients (id, name, external_reference)
      VALUES (${id}, ${clientName}, ${`PF-${clientCode}-001`})
      ON CONFLICT (external_reference) DO NOTHING
      RETURNING id
    `;
    // A concurrent submission may have won the race for the same client
    // code: ON CONFLICT DO NOTHING then returns no row, so re-resolve the
    // actual row instead of returning an id that does not exist (which would
    // violate the change_requests.client_id FK).
    if (inserted.length > 0) return String(inserted[0].id);
    return (await getPublicClientIdByCode(clientCode)) ?? id;
  } catch {
    return null;
  }
}
