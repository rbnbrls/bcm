"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getBenchmarks, getClientConfigs, saveChangeRequest } from "@/lib/db";

export type FormState = { message?: string; issues?: string[] };

const itemSchema = z.object({
  portfolioId: z.string().uuid(),
  previousBenchmarkId: z.string().uuid(),
  requestedBenchmarkId: z.string().uuid(),
});

export async function createBenchmarkChange(_: FormState, formData: FormData): Promise<FormState> {
  const rawItems = formData.get("items");
  let items: z.infer<typeof itemSchema>[];
  try {
    items = z.array(itemSchema).min(1).parse(JSON.parse(String(rawItems ?? "[]")));
  } catch {
    return { issues: ["Kies minimaal één portefeuille voor de change."] };
  }

  const input = z.object({
    clientId: z.string().uuid(),
    requestedBy: z.string().trim().min(2, "Vul de naam van de aanvrager in."),
    rationale: z.string().trim().min(10, "Licht de reden van de wijziging in minimaal 10 tekens toe."),
    effectiveDate: z.string().date("Kies een geldige ingangsdatum."),
  }).safeParse(Object.fromEntries(formData));
  if (!input.success) return { issues: input.error.issues.map((issue) => issue.message) };
  if (input.data.effectiveDate < new Date().toISOString().slice(0, 10)) return { issues: ["De ingangsdatum mag niet in het verleden liggen."] };

  const [clients, benchmarkCatalog] = await Promise.all([getClientConfigs(), getBenchmarks()]);
  const client = clients.find((candidate) => candidate.id === input.data.clientId);
  if (!client) return { issues: ["De gekozen klant bestaat niet in de client config."] };
  const validBenchmarks = new Set(benchmarkCatalog.map((benchmark) => benchmark.id));
  const portfolioMap = new Map(client.portfolios.map((portfolio) => [portfolio.id, portfolio]));
  const issues: string[] = [];
  const uniquePortfolios = new Set<string>();
  for (const item of items) {
    const portfolio = portfolioMap.get(item.portfolioId);
    if (!portfolio) issues.push("Een gekozen portefeuille hoort niet bij deze klant.");
    else if (portfolio.currentBenchmarkId !== item.previousBenchmarkId) issues.push(`${portfolio.name}: de IST-benchmark is niet meer actueel.`);
    if (!validBenchmarks.has(item.requestedBenchmarkId)) issues.push("Een gekozen SOLL-benchmark is niet beschikbaar.");
    if (item.previousBenchmarkId === item.requestedBenchmarkId) issues.push("De SOLL-benchmark moet verschillen van de IST-benchmark.");
    if (uniquePortfolios.has(item.portfolioId)) issues.push("Een portefeuille mag maar één keer voorkomen.");
    uniquePortfolios.add(item.portfolioId);
  }
  if (issues.length) return { issues };

  const id = randomUUID();
  const reference = `BCM-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  try {
    await saveChangeRequest({ ...input.data, id, reference, items: items.map((item) => ({ ...item, id: randomUUID() })) });
  } catch (error) {
    return { issues: [error instanceof Error ? error.message : "De change kon niet worden opgeslagen."] };
  }
  redirect(`/changes/${id}`);
}
