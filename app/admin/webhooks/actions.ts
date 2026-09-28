"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { getWebhookConfigs, saveWebhookConfig, deleteWebhookConfig } from "@/lib/db";
import type { WebhookConfig } from "@/lib/types";
import { captureError } from "@/lib/sentry-helper";
import { requireAdmin } from "@/lib/admin-auth-request";

export type WebhookState = { ok: true; message: string } | { ok: false; message: string };

export async function listWebhooks(): Promise<WebhookConfig[]> {
  const auth = await requireAdmin();
  if (!auth.authorized) throw new Error(auth.message);
  return getWebhookConfigs();
}

export async function createWebhook(_: WebhookState | null, formData: FormData): Promise<WebhookState> {
  const auth = await requireAdmin();
  if (!auth.authorized) return { ok: false, message: auth.message };
  const name = formData.get("name")?.toString().trim();
  const url = formData.get("url")?.toString().trim();
  const secret = formData.get("secret")?.toString().trim() || null;
  const eventsRaw = formData.get("events")?.toString().trim();

  if (!name || name.length < 2) return { ok: false, message: "Naam is verplicht (minimaal 2 tekens)." };
  if (!url || !url.startsWith("http")) return { ok: false, message: "Voer een geldige URL in (begint met http of https)." };
  if (!eventsRaw) return { ok: false, message: "Selecteer minimaal één event." };

  const events = eventsRaw.split(",").map((e) => e.trim()).filter(Boolean);
  if (events.length === 0) return { ok: false, message: "Selecteer minimaal één event." };

  try {
    new URL(url);
  } catch {
    return { ok: false, message: "URL is ongeldig." };
  }

  try {
    await saveWebhookConfig({
      id: randomUUID(),
      name,
      url,
      secret,
      events,
      active: true,
    });
    revalidatePath("/admin/webhooks");
    return { ok: true, message: `Webhook "${name}" aangemaakt.` };
  } catch (e: any) {
    captureError(e, { endpoint: "createWebhook", phase: "server_action" });
    return { ok: false, message: e.message || "Webhook aanmaken mislukt." };
  }
}

export async function removeWebhook(id: string): Promise<WebhookState> {
  const auth = await requireAdmin();
  if (!auth.authorized) return { ok: false, message: auth.message };
  try {
    await deleteWebhookConfig(id);
    revalidatePath("/admin/webhooks");
    return { ok: true, message: "Webhook verwijderd." };
  } catch (e: any) {
    captureError(e, { endpoint: "removeWebhook", phase: "server_action" });
    return { ok: false, message: e.message || "Verwijderen mislukt." };
  }
}
