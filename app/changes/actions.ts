"use server";

import { revalidatePath } from "next/cache";
import { updateChangeStatus, updateNotificationSent } from "@/lib/db";
import type { ChangeStatus } from "@/lib/types";

export type StatusActionState = { success: boolean; message: string };

export async function updateStatus(_prev: StatusActionState, formData: FormData): Promise<StatusActionState> {
  const id = formData.get("id") as string;
  const newStatus = formData.get("status") as ChangeStatus;
  const userName = formData.get("userName") as string;

  if (!id || !newStatus) {
    return { success: false, message: "Missing required fields." };
  }

  try {
    await updateChangeStatus(id, newStatus, userName || undefined);
    revalidatePath(`/changes/${id}`);
    revalidatePath("/changes");
    return { success: true, message: `Status bijgewerkt naar ${newStatus}.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende fout";
    return { success: false, message };
  }
}

export async function sendNotifications(_prev: StatusActionState, formData: FormData): Promise<StatusActionState> {
  const id = formData.get("id") as string;
  if (!id) return { success: false, message: "Missing change request ID." };

  try {
    const { getChangeRequest } = await import("@/lib/db");
    const change = await getChangeRequest(id);
    if (!change) return { success: false, message: "Change request not found." };

    // Send webhook notifications to stakeholders
    const stakeholders = [
      { name: "Eigen administratie", webhook: process.env.WEBHOOK_ADMINISTRATIE },
      { name: "Asset service provider", webhook: process.env.WEBHOOK_ASSET_SERVICE },
      { name: "FactSet", webhook: process.env.WEBHOOK_FACTSET },
    ];

    const payload = {
      type: "change_request_submitted",
      reference: change.reference,
      clientName: change.clientName,
      changeType: change.changeType,
      effectiveDate: change.effectiveDate,
      requestedBy: change.requestedBy,
      rationale: change.rationale,
      url: `${process.env.BASE_URL || "https://bcm.7rb.nl"}/changes/${id}`,
    };

    const results: string[] = [];
    for (const stakeholder of stakeholders) {
      if (stakeholder.webhook) {
        try {
          const res = await fetch(stakeholder.webhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, stakeholder: stakeholder.name }),
          });
          results.push(`${stakeholder.name}: ${res.ok ? "OK" : `fout (${res.status})`}`);
        } catch (e) {
          results.push(`${stakeholder.name}: netwerkfout`);
        }
      } else {
        results.push(`${stakeholder.name}: geen webhook geconfigureerd`);
      }
    }

    await updateNotificationSent(id);
    revalidatePath(`/changes/${id}`);
    revalidatePath("/changes");

    return { success: true, message: `Notificaties verzonden.\n${results.join("\n")}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende fout";
    return { success: false, message };
  }
}
