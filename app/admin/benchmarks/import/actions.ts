"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { insertBenchmarksBulk } from "@/lib/db";
import { z } from "zod";

export type ImportState = { ok: true; inserted: number; skipped: number } | { ok: false; issues: string[] };

const LINE_RE = /^(?<code>[^,]+),(?<name>[^,]+),(?<assetClass>[^,]+),(?<currency>[^,]+),(?<cost>\d+(?:\.\d+)?),(?<provider>[^,]+)/;

export async function importBenchmarksCsv(_: ImportState | null, formData: FormData): Promise<ImportState> {
  const csv = formData.get("csv")?.toString().trim();
  if (!csv) return { ok: false, issues: ["Geen CSV-data ontvangen."] };

  const lines = csv.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { ok: false, issues: ["CSV moet minimaal een headerrij en één datarij bevatten."] };

  // Skip header line (first row), parse the rest
  const benchmarks: Array<{
    id: string; code: string; name: string; assetClass: string;
    currency: string; cost: number; provider: string;
  }> = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(LINE_RE);
    if (!match) {
      errors.push(`Regel ${i + 1}: kan niet worden geparset. Verwacht: code,naam,assetClass,valuta,kosten,provider`);
      continue;
    }
    const { code, name, assetClass, currency, cost, provider } = match.groups!;
    const parsedCost = z.coerce.number().min(0).safeParse(cost);
    if (!parsedCost.success) {
      errors.push(`Regel ${i + 1}: ongeldige kostenwaarde "${cost}".`);
      continue;
    }
    if (!["EUR", "USD", "GBP"].includes(currency.toUpperCase())) {
      errors.push(`Regel ${i + 1}: ongeldige valuta "${currency}". Gebruik EUR, USD of GBP.`);
      continue;
    }
    benchmarks.push({
      id: randomUUID(),
      code: code.trim(),
      name: name.trim(),
      assetClass: assetClass.trim(),
      currency: currency.toUpperCase(),
      cost: parsedCost.data,
      provider: provider.trim(),
    });
  }

  if (benchmarks.length === 0) {
    return { ok: false, issues: errors.length > 0 ? errors : ["Geen geldige benchmark-data gevonden."] };
  }

  try {
    const result = await insertBenchmarksBulk(benchmarks);
    revalidatePath("/benchmarks");
    revalidatePath("/admin/client-config");
    const allIssues = errors.length > 0
      ? [`${result.inserted} benchmarks geïmporteerd, ${result.skipped} overgeslagen.`, ...errors]
      : [];
    if (allIssues.length > 0) {
      return { ok: true, inserted: result.inserted, skipped: result.skipped };
    }
    return { ok: true, inserted: result.inserted, skipped: result.skipped };
  } catch (e: any) {
    return { ok: false, issues: [e.message || "Import mislukt."] };
  }
}
