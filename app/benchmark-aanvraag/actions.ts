"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getClientConfigs, saveChangeRequest, saveNewBenchmarkRequest } from "@/lib/db";

export type FormState = { message?: string; issues?: string[] };

export async function createNewBenchmark(_: FormState, formData: FormData): Promise<FormState> {
  const input = z.object({
    clientId: z.string().uuid("Kies een geldige klant."),
    requestedBy: z.string().trim().min(2, "Vul de naam van de aanvrager in."),
    rationale: z.string().trim().min(10, "Licht de reden van de aanvraag in minimaal 10 tekens toe."),
    effectiveDate: z.string().date("Kies een geldige ingangsdatum."),
    shortName: z.string().trim().min(2, "Korte naam is verplicht (minimaal 2 tekens).").toUpperCase(),
    longName: z.string().trim().min(3, "Lange naam is verplicht (minimaal 3 tekens)."),
    assetClass: z.string().trim().min(2, "Asset class is verplicht."),
    currency: z.string().trim().length(3, "Valuta moet een 3-lettercode zijn (bijv. EUR).").toUpperCase(),
  }).safeParse(Object.fromEntries(formData));

  if (!input.success) return { issues: input.error.issues.map((issue) => issue.message) };

  const { data } = input;

  const todayLocal = new Date().toLocaleDateString("en-CA"); // en-CA gives YYYY-MM-DD in local timezone
  if (data.effectiveDate < todayLocal) {
    return { issues: ["De ingangsdatum mag niet in het verleden liggen."] };
  }

  const clients = await getClientConfigs();
  const client = clients.find((c) => c.id === data.clientId);
  if (!client) return { issues: ["De gekozen klant bestaat niet in de client config."] };

  const id = randomUUID();
  const reference = `BCM-${new Date().getFullYear()}-NB-${String(Date.now()).slice(-6)}`;

  try {
    await saveChangeRequest({
      id,
      reference,
      changeType: "new_benchmark",
      clientId: data.clientId,
      requestedBy: data.requestedBy,
      rationale: data.rationale,
      effectiveDate: data.effectiveDate,
      items: [],
    });

    await saveNewBenchmarkRequest({
      id: randomUUID(),
      changeRequestId: id,
      shortName: data.shortName,
      longName: data.longName,
      assetClass: data.assetClass,
      currency: data.currency,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "De aanvraag kon niet worden opgeslagen.";
    if (message.includes("foreign key constraint") || message.includes("violates foreign key")) {
      return { issues: ["Er is een inconsistentie in de database — de aanvraag verwijst naar een niet-bestaande benchmark. Neem contact op met de beheerder."] };
    }
    return { issues: [message] };
  }

  redirect(`/changes/${id}`);
}
