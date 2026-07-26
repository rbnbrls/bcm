"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getBenchmarks, getClientConfigs, getChangeTypeBySlug, getConflictingPortfolioIds, insertBenchmark, saveChangeRequest } from "@/lib/db";

export type FormState = { message?: string; issues?: string[] };

const itemSchema = z.object({
  portfolioId: z.string().uuid(),
  previousBenchmarkId: z.string().uuid(),
  requestedBenchmarkId: z.string().uuid(),
});

const newBenchmarkItemSchema = z.object({
  portfolioId: z.string().uuid(),
  previousBenchmarkId: z.string().uuid(),
  details: z.object({
    shortName: z.string().trim().min(2),
    longName: z.string().trim().min(3),
    assetClass: z.string().trim().min(2),
  }),
});

export async function createBenchmarkChange(_: FormState, formData: FormData): Promise<FormState> {
  // Parse existing benchmark switch items
  const rawItems = formData.get("items");
  let items: z.infer<typeof itemSchema>[] = [];
  try {
    const parsed = JSON.parse(String(rawItems ?? "[]"));
    items = z.array(itemSchema).parse(parsed);
  } catch {
    // No valid existing-benchmark items — that's ok, they might all be new
  }

  // Parse new benchmark items
  const rawNewItems = formData.get("newBenchmarkItems");
  let newItems: z.infer<typeof newBenchmarkItemSchema>[] = [];
  try {
    const parsed = JSON.parse(String(rawNewItems ?? "[]"));
    newItems = z.array(newBenchmarkItemSchema).parse(parsed);
  } catch {
    // No valid new-benchmark items either
  }

  if (items.length === 0 && newItems.length === 0) {
    return { issues: ["Kies minimaal één portefeuille voor de change."] };
  }

  const input = z.object({
    clientId: z.string().uuid(),
    requestedBy: z.string().trim().min(2, "Vul de naam van de aanvrager in."),
    rationale: z.string().trim().min(10, "Licht de reden van de wijziging in minimaal 10 tekens toe."),
    effectiveDate: z.string().date("Kies een geldige ingangsdatum."),
  }).safeParse(Object.fromEntries(formData));
  if (!input.success) return { issues: input.error.issues.map((issue) => issue.message) };
  const todayLocal = new Date().toLocaleDateString("en-CA"); // en-CA gives YYYY-MM-DD in local timezone
  if (input.data.effectiveDate < todayLocal) return { issues: ["De ingangsdatum mag niet in het verleden liggen."] };

  const [clients, benchmarkCatalog] = await Promise.all([getClientConfigs(), getBenchmarks()]);
  const client = clients.find((candidate) => candidate.id === input.data.clientId);
  if (!client) return { issues: ["De gekozen klant bestaat niet in de client config."] };
  const validBenchmarks = new Set(benchmarkCatalog.map((benchmark) => benchmark.id));
  const portfolioMap = new Map(client.portfolios.map((portfolio) => [portfolio.id, portfolio]));
  const issues: string[] = [];
  const uniquePortfolios = new Set<string>();

  // Validate existing-benchmark items
  for (const item of items) {
    const portfolio = portfolioMap.get(item.portfolioId);
    if (!portfolio) issues.push("Een gekozen portefeuille hoort niet bij deze klant.");
    else if (portfolio.currentBenchmarkId !== item.previousBenchmarkId) issues.push(`${portfolio.name}: de IST-benchmark is niet meer actueel.`);
    if (!validBenchmarks.has(item.requestedBenchmarkId)) issues.push("Een gekozen SOLL-benchmark is niet beschikbaar.");
    if (item.previousBenchmarkId === item.requestedBenchmarkId) issues.push("De SOLL-benchmark moet verschillen van de IST-benchmark.");
    if (uniquePortfolios.has(item.portfolioId)) issues.push("Een portefeuille mag maar één keer voorkomen.");
    uniquePortfolios.add(item.portfolioId);
  }

  // Validate new-benchmark items
  for (const item of newItems) {
    const portfolio = portfolioMap.get(item.portfolioId);
    if (!portfolio) issues.push("Een gekozen portefeuille hoort niet bij deze klant.");
    else if (portfolio.currentBenchmarkId !== item.previousBenchmarkId) issues.push(`${portfolio.name}: de IST-benchmark is niet meer actueel.`);
    if (uniquePortfolios.has(item.portfolioId)) issues.push("Een portefeuille mag maar één keer voorkomen.");
    uniquePortfolios.add(item.portfolioId);
  }

  if (issues.length) return { issues };

  // ── Duplicate/conflict detection ──
  const allPortfolioIds = [
    ...items.map((i) => i.portfolioId),
    ...newItems.map((i) => i.portfolioId),
  ];
  if (allPortfolioIds.length > 0) {
    const conflicting = await getConflictingPortfolioIds(allPortfolioIds);
    if (conflicting.size > 0) {
      const portfolioNames = client.portfolios
        .filter((p) => conflicting.has(p.id))
        .map((p) => p.name);
      return { issues: [`Voor de volgende portefeuille(s) loopt al een openstaande change; wacht tot deze is afgerond: ${portfolioNames.join(", ")}`] };
    }
  }

  const id = randomUUID();
  const reference = `BCM-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

  try {
    // Create new benchmarks in the catalog and build items list
    const allItems: Array<{ id: string; portfolioId: string; previousBenchmarkId: string; requestedBenchmarkId: string }> = [];

    // Existing benchmark switches
    for (const item of items) {
      allItems.push({ ...item, id: randomUUID() });
    }

    // New benchmark switches: create benchmark first, then reference it
    for (const item of newItems) {
      const benchmarkId = randomUUID();
      await insertBenchmark({
        id: benchmarkId,
        code: item.details.shortName.toUpperCase().replace(/\s+/g, "-"),
        name: item.details.longName,
        assetClass: item.details.assetClass,
        currency: "EUR",
      });
      allItems.push({
        id: randomUUID(),
        portfolioId: item.portfolioId,
        previousBenchmarkId: item.previousBenchmarkId,
        requestedBenchmarkId: benchmarkId,
      });
    }

    const changeTypeConfig = await getChangeTypeBySlug("benchmark_switch");
    const totalItems = allItems.length;
    const estimatedCost = changeTypeConfig
      ? changeTypeConfig.cost.baseCost + (changeTypeConfig.cost.perItemCost ?? 0) * totalItems
      : undefined;

    await saveChangeRequest({
      ...input.data,
      id,
      reference,
      changeType: "benchmark_switch",
      changeTypeId: changeTypeConfig?.id,
      items: allItems,
      fields: allItems.map((item) => ({
        fieldKey: "portfolio_id",
        istValue: item.portfolioId,
        sollValue: item.portfolioId,
      })),
      estimatedCost,
      estimatedCostCurrency: changeTypeConfig?.cost.costCurrency ?? "EUR",
      estimatedLeadDays: changeTypeConfig?.defaultLeadDays ?? 7,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "De change kon niet worden opgeslagen.";
    // Detect FK violations and give a clear explanation
    if (message.includes("foreign key constraint") || message.includes("violates foreign key")) {
      return { issues: ["De gekozen SOLL-benchmark bestaat niet (meer) in de benchmarkcatalogus. Ververs de pagina en probeer het opnieuw."] };
    }
    return { issues: [message] };
  }
  redirect(`/changes/${id}`);
}
