"use server";

import { revalidatePath } from "next/cache";
import { updateChangeStatus, getChangeRequest } from "@/lib/db";
import { updateChangePortfolioConfiguration, deleteChangePortfolioConfiguration } from "@/lib/client-config-db";
import { validateFormat } from "@/lib/validation-rules";
import type { ChangeStatus } from "@/lib/types";
import { reportError } from "@/lib/error-reporter";
import { accessDeniedIssue, requirePermission } from "@/lib/rbac-request";
import { getChangeTypePermission } from "@/lib/change-type-registry";
import { getIdentityContext } from "@/lib/identity/request";

export type StatusActionState = { success: boolean; message: string };

export async function updateStatus(_prev: StatusActionState, formData: FormData): Promise<StatusActionState> {
  const id = String(formData.get("id") ?? "");
  const newStatus = formData.get("status") as ChangeStatus;

  if (!id || !newStatus) {
    return { success: false, message: "Missing required fields." };
  }
  if (newStatus === "accepted" || newStatus === "in_progress" || newStatus === "processed") {
    const change = await getChangeRequest(id);
    if (!change) return { success: false, message: "Change request niet gevonden." };
    const access = await requirePermission(getChangeTypePermission(change.changeType, "approve"));
    if (!access.authorized) {
      return { success: false, message: accessDeniedIssue(access) };
    }
  }

  try {
    const actor = await getIdentityContext();
    await updateChangeStatus(id, newStatus, actor.displayName);
    revalidatePath(`/changes/${id}`);
    revalidatePath("/changes");
    return { success: true, message: `Status bijgewerkt naar ${newStatus}.` };
  } catch (error) {
    await reportError(error, { action: "update-status" });
    const message = error instanceof Error ? error.message : "Onbekende fout";
    return { success: false, message };
  }
}

export async function sendNotifications(_prev: StatusActionState, formData: FormData): Promise<StatusActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { success: false, message: "Missing change request ID." };

  try {
    const { getChangeRequest } = await import("@/lib/db");
    const change = await getChangeRequest(id);
    if (!change) return { success: false, message: "Change request not found." };

    const { sendChangeNotifications } = await import("@/lib/notifications");
    const results = await sendChangeNotifications(change);

    const lines = results.map((r) =>
      r.success
        ? `${r.stakeholder}: OK (${r.channel})`
        : `${r.stakeholder}: mislukt — ${r.error || r.response || "onbekende fout"}`
    );

    revalidatePath(`/changes/${id}`);
    revalidatePath("/changes");

    const allOk = results.every((r) => r.success);
    return {
      success: allOk,
      message: allOk
        ? `Notificaties verzonden naar alle stakeholders.\n${lines.join("\n")}`
        : `Sommige notificaties zijn mislukt.\n${lines.join("\n")}`,
    };
  } catch (error) {
    await reportError(error, { action: "send-notifications" });
    const message = error instanceof Error ? error.message : "Onbekende fout";
    return { success: false, message };
  }
}

/**
 * The allowed statuses for amending staged configuration rows.
 * Only submitted or accepted changes can be amended before processing.
 */
const AMEND_ALLOWED_STATUSES = new Set(["submitted", "accepted"]);

export type AmendConfigState = { success: boolean; message: string };

/**
 * The allowed statuses for deleting staged configuration rows.
 * Drafts can be freely edited, submitted/accepted are amendable before processing.
 */
const DELETE_ALLOWED_STATUSES = new Set(["draft", "submitted", "accepted"]);

export type DeleteConfigState = { success: boolean; message: string };

/**
 * Delete a staged change_portfolio_configuration row.
 *
 * Allowed when the change request is in 'draft', 'submitted', or 'accepted'
 * status — i.e. before it has been processed. This lets users remove rows
 * they no longer want from multi-row changes.
 *
 * The form sends stagedRowId and changeRequestId.
 * Returns a state object compatible with useActionState.
 */
export async function deletePortfolioConfig(
  _prev: DeleteConfigState,
  formData: FormData,
): Promise<DeleteConfigState> {
  const stagedRowId = Number(formData.get("stagedRowId"));
  const changeRequestId = String(formData.get("changeRequestId") ?? "");

  if (!stagedRowId || !changeRequestId) {
    return { success: false, message: "Ontbrekende velden." };
  }

  try {
    // 1. Verify the change request exists and is in a deletable state
    const change = await getChangeRequest(changeRequestId);
    if (!change) {
      return { success: false, message: "Change request niet gevonden." };
    }
    if (!DELETE_ALLOWED_STATUSES.has(change.status)) {
      return {
        success: false,
        message: `Verwijderen is niet toegestaan in status '${change.status}'. Alleen 'Concept', 'Ingediend' of 'Geaccordeerd' kunnen worden verwijderd.`,
      };
    }

    // 2. Delete the staged row
    const deleted = await deleteChangePortfolioConfiguration(stagedRowId);
    if (!deleted) {
      return { success: false, message: "Staged rij niet gevonden." };
    }

    revalidatePath(`/changes/${changeRequestId}`);
    return { success: true, message: "Staged configuratie verwijderd." };
  } catch (error) {
    await reportError(error, { action: "delete-portfolio-config" });
    const message = error instanceof Error ? error.message : "Onbekende fout";
    return { success: false, message };
  }
}

/**
 * Amend a staged change_portfolio_configuration row.
 *
 * Only allowed when the change request is in 'submitted' or 'accepted'
 * status — i.e. before it has been processed. This allows stakeholders
 * to correct SOLL values without direct live table writes.
 *
 * The form sends the stagedRowId, changeRequestId, and all field values
 * as individual form entries (field_<key>=<value>). The action builds
 * a single patch and applies it atomically.
 *
 * Returns a state object compatible with useActionState.
 */
export async function amendPortfolioConfig(
  _prev: AmendConfigState,
  formData: FormData,
): Promise<AmendConfigState> {
  const stagedRowId = Number(formData.get("stagedRowId"));
  const changeRequestId = String(formData.get("changeRequestId") ?? "");

  if (!stagedRowId || !changeRequestId) {
    return { success: false, message: "Ontbrekende velden." };
  }

  try {
    // 1. Verify the change request exists and is in an amendable state
    const change = await getChangeRequest(changeRequestId);
    if (!change) {
      return { success: false, message: "Change request niet gevonden." };
    }
    if (!AMEND_ALLOWED_STATUSES.has(change.status)) {
      return {
        success: false,
        message: `Wijzigen is niet toegestaan in status '${change.status}'. Alleen 'Ingediend' of 'Geaccordeerd' kunnen worden gewijzigd.`,
      };
    }

    // 2. Collect all field_<key>=<value> pairs from the form
    const patchEntries: Array<{ key: string; value: string }> = [];
    for (const [name, rawValue] of formData.entries()) {
      if (name.startsWith("field_")) {
        const fieldKey = name.slice(6); // strip "field_" prefix
        patchEntries.push({ key: fieldKey, value: String(rawValue) });
      }
    }

    if (patchEntries.length === 0) {
      return { success: false, message: "Geen velden om op te slaan." };
    }

    // 3. Build a single patch from all entries
    let patch: Record<string, unknown> = {};
    const KEY_MAP: Record<string, string> = {
      portfolio_code: "portfolioCode",
      client_code: "clientCode",
      asset_class_code: "assetClassCode",
      sub_asset_class_code: "subAssetClassCode",
      manager_code: "managerCode",
      benchmark_code: "benchmarkCode",
      npc_classification_id: "npcClassificationId",
      long_name: "longName",
      short_name: "shortName",
      effective_from: "effectiveFrom",
      effective_until: "effectiveUntil",
    };

    for (const { key, value } of patchEntries) {
      const prop = KEY_MAP[key];
      if (!prop) {
        throw new Error(`Onbekend veld: ${key}`);
      }
      if (prop === "npcClassificationId") {
        patch[prop] = Number(value);
      } else if (prop === "effectiveUntil" && value === "") {
        patch[prop] = null;
      } else {
        patch[prop] = value;
      }
    }

    // 3b. Validate the patched fields before writing them. The staged row's
    // name columns carry a DB CHECK (1..N chars, no CR/LF); running the same
    // rules the create flow uses keeps invalid edits from surfacing as raw
    // PostgreSQL constraint violations.
    const formatErrors = validateFormat(patch as Parameters<typeof validateFormat>[0]);
    if (formatErrors.length > 0) {
      return { success: false, message: formatErrors.join(" ") };
    }
    if (typeof patch.longName === "string" && patch.longName.length === 0) {
      return { success: false, message: "Lange naam mag niet leeg zijn." };
    }
    if (typeof patch.shortName === "string" && patch.shortName.length === 0) {
      return { success: false, message: "Korte naam mag niet leeg zijn." };
    }

    // 4. Apply the update
    await updateChangePortfolioConfiguration(stagedRowId, patch as any);

    revalidatePath(`/changes/${changeRequestId}`);
    return { success: true, message: "Wijziging opgeslagen." };
  } catch (error) {
    await reportError(error, { action: "amend-portfolio-config" });
    const message = error instanceof Error ? error.message : "Onbekende fout";
    return { success: false, message };
  }
}
