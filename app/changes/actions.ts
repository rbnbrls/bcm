"use server";

import { revalidatePath } from "next/cache";
import { updateChangeStatus, updateNotificationSent } from "@/lib/db";
import type { ChangeStatus } from "@/lib/types";

export type StatusActionState = { success: boolean; message: string };

export async function updateStatus(_prev: StatusActionState, formData: FormData): Promise<StatusActionState> {
  const id = String(formData.get("id") ?? "");
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
    const message = error instanceof Error ? error.message : "Onbekende fout";
    return { success: false, message };
  }
}
