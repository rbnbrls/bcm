"use server";

import { revalidatePath } from "next/cache";
import { saveApproval, dispatchWebhooks, getChangeRequest } from "@/lib/db";
import { reportError } from "@/lib/error-reporter";
import { accessDeniedIssue, requirePermission } from "@/lib/rbac-request";
import { getChangeTypePermission } from "@/lib/change-type-registry";

export type ApprovalState = { message?: string; success?: boolean };

export async function approveChange(
  _: ApprovalState,
  formData: FormData
): Promise<ApprovalState> {
  const changeRequestId = formData.get("changeRequestId");
  const approver = formData.get("approver");
  const remarks = formData.get("remarks");

  if (!changeRequestId || typeof changeRequestId !== "string") {
    return { message: "Geen change request ID opgegeven.", success: false };
  }
  const change = await getChangeRequest(changeRequestId);
  if (!change) return { message: "Change request niet gevonden.", success: false };

  const access = await requirePermission(getChangeTypePermission(change.changeType, "approve"));
  if (!access.authorized) return { message: accessDeniedIssue(access), success: false };

  if (!approver || typeof approver !== "string" || approver.trim().length < 2) {
    return { message: "Vul de naam van de accordeur in.", success: false };
  }

  try {
    await saveApproval({
      changeRequestId,
      approver: approver.trim(),
      decision: "approved",
      remarks: typeof remarks === "string" && remarks.trim() ? remarks.trim() : null,
    });
    // Fire webhooks in the background (don't block approval response)
    dispatchWebhooks("change.approved", { changeRequestId, approver: approver.trim() }).catch((e) =>
      console.error("[approval] Webhook dispatch failed for approved:", e)
    );
    revalidatePath(`/changes/${changeRequestId}`);
    return { message: "Change request goedgekeurd.", success: true };
  } catch (error) {
    await reportError(error, { action: "approve-change" });
    const message = error instanceof Error ? error.message : "Goedkeuren is mislukt.";
    return { message, success: false };
  }
}

export async function rejectChange(
  _: ApprovalState,
  formData: FormData
): Promise<ApprovalState> {
  const changeRequestId = formData.get("changeRequestId");
  const approver = formData.get("approver");
  const remarks = formData.get("remarks");

  if (!changeRequestId || typeof changeRequestId !== "string") {
    return { message: "Geen change request ID opgegeven.", success: false };
  }
  const change = await getChangeRequest(changeRequestId);
  if (!change) return { message: "Change request niet gevonden.", success: false };

  const access = await requirePermission(getChangeTypePermission(change.changeType, "approve"));
  if (!access.authorized) return { message: accessDeniedIssue(access), success: false };

  if (!approver || typeof approver !== "string" || approver.trim().length < 2) {
    return { message: "Vul de naam van de afwijzer in.", success: false };
  }
  if (!remarks || typeof remarks !== "string" || remarks.trim().length < 10) {
    return { message: "Geef een reden voor afwijzing (minimaal 10 tekens).", success: false };
  }

  try {
    await saveApproval({
      changeRequestId,
      approver: approver.trim(),
      decision: "rejected",
      remarks: remarks.trim(),
    });
    // Fire webhooks in the background
    dispatchWebhooks("change.rejected", { changeRequestId, approver: approver.trim() }).catch((e) =>
      console.error("[approval] Webhook dispatch failed for rejected:", e)
    );
    revalidatePath(`/changes/${changeRequestId}`);
    return { message: "Change request afgewezen.", success: true };
  } catch (error) {
    await reportError(error, { action: "reject-change" });
    const message = error instanceof Error ? error.message : "Afwijzen is mislukt.";
    return { message, success: false };
  }
}
