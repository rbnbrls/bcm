"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { getWebhookConfigs, saveWebhookConfig, deleteWebhookConfig } from "@/lib/db";
import type { WebhookConfig } from "@/lib/types";
import { reportError } from "@/lib/error-reporter";

export type WebhookState = { ok: true; message: string } | { ok: false; message: string };

export async function listWebhooks(): Promise<WebhookConfig[]> {
  return getWebhookConfigs();
}

export async function createWebhook(_: WebhookState | null, formData: FormData): Promise<WebhookState> {
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
    await reportError(e, { action: "create-webhook", userMessage: "Webhook aanmaken mislukt." });
    return { ok: false, message: e.message || "Webhook aanmaken mislukt." };
  }
}

export async function removeWebhook(id: string): Promise<WebhookState> {
  try {
    await deleteWebhookConfig(id);
    revalidatePath("/admin/webhooks");
    return { ok: true, message: "Webhook verwijderd." };
  } catch (e: any) {
    await reportError(e, { action: "remove-webhook", userMessage: "Verwijderen mislukt." });
    return { ok: false, message: e.message || "Verwijderen mislukt." };
  }
}
