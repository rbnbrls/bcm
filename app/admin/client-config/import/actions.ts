"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { upsertClientsPortfolios } from "@/lib/db";

export type ImportState = { ok: true; clients: number; portfolios: number; warnings: string[] } | { ok: false; issues: string[] };

const LINE_RE = /^(?<clientName>[^,]+),(?<clientReference>[^,]+),(?<portfolioName>[^,]+),(?<portfolioReference>[^,]+),(?<benchmarkCode>[^,]+)/;

export async function importClientConfigCsv(_: ImportState | null, formData: FormData): Promise<ImportState> {
  const csv = formData.get("csv")?.toString().trim();
  if (!csv) return { ok: false, issues: ["Geen CSV-data ontvangen."] };

  const lines = csv.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { ok: false, issues: ["CSV moet minimaal een headerrij en één datarij bevatten."] };

  interface Row { clientId: string; clientName: string; clientReference: string; portfolioId: string; portfolioName: string; portfolioReference: string; benchmarkCode: string; }
  const rows: Row[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(LINE_RE);
    if (!match) {
      errors.push(`Regel ${i + 1}: kan niet worden geparset. Verwacht: clientName,clientReference,portfolioName,portfolioReference,benchmarkCode`);
      continue;
    }
    const { clientName, clientReference, portfolioName, portfolioReference, benchmarkCode } = match.groups!;
    rows.push({
      clientId: randomUUID(),
      clientName: clientName.trim(),
      clientReference: clientReference.trim(),
      portfolioId: randomUUID(),
      portfolioName: portfolioName.trim(),
      portfolioReference: portfolioReference.trim(),
      benchmarkCode: benchmarkCode.trim(),
    });
  }

  if (rows.length === 0) {
    return { ok: false, issues: errors.length > 0 ? errors : ["Geen geldige config-data gevonden."] };
  }

  try {
    const result = await upsertClientsPortfolios(rows);
    revalidatePath("/admin/client-config");
    revalidatePath("/changes/new");
    const warnings = [...result.errors, ...errors];
    return { ok: true, clients: result.clientsCreated, portfolios: result.portfoliosCreated, warnings };
  } catch (e: any) {
    return { ok: false, issues: [e.message || "Import mislukt."] };
  }
}
