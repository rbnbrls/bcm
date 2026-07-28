/**
 * Server actions for importing client_config data (new schema).
 *
 * All input is validated through the clientConfigInput Zod schemas before
 * any database write occurs.
 */

"use server";

import { revalidatePath } from "next/cache";
import { validateInput, LegalEntityInput, ParentAccountInput, PortfolioInput, ManagerInput, BenchmarkInput, ModelInput, ClassificationInput, StrategyInput, SubStrategyInput, AccountInput } from "@/lib/schemas/clientConfigInput";
import type { ValidationIssue } from "@/lib/schemas/clientConfigInput";

// ═════════════════════════════════════════════════════════════════════
// Types
// ═════════════════════════════════════════════════════════════════════

export type BatchImportResult = {
  success: boolean;
  imported: { entity: string; count: number }[];
  errors: { entity: string; row: number; issues: ValidationIssue[] }[];
};

// ═════════════════════════════════════════════════════════════════════
// Batch validation functions
// ═════════════════════════════════════════════════════════════════════

function validateBatch<T>(
  schema: { safeParse: (x: unknown) => { success: true; data: T } | { success: false; error: { issues: ValidationIssue[] } } },
  items: unknown[],
  entityName: string,
): { count: number; errors: { row: number; issues: ValidationIssue[] }[] } {
  let valid = 0;
  const errors: { row: number; issues: ValidationIssue[] }[] = [];

  for (let i = 0; i < items.length; i++) {
    const result = schema.safeParse(items[i]);
    if (result.success) {
      valid++;
    } else {
      errors.push({
        row: i + 1,
        issues: result.error.issues.map((issue: any) => ({
          path: issue.path?.join(".") ?? "",
          message: issue.message,
        })),
      });
    }
  }

  return { count: valid, errors };
}

// ═════════════════════════════════════════════════════════════════════
// Full import — batch all entities together
// ═════════════════════════════════════════════════════════════════════

export interface FullImportPayload {
  legalEntities?: unknown[];
  parentAccounts?: unknown[];
  portfolios?: unknown[];
  managers?: unknown[];
  benchmarks?: unknown[];
  models?: unknown[];
  classifications?: unknown[];
  strategies?: unknown[];
  subStrategies?: unknown[];
  accounts?: unknown[];
}

/**
 * Validate and import a full client_config dataset.
 * Validates all entities before writing any.
 * Currently validates only — database writes are wired when TypeORM is integrated.
 */
export async function importFullClientConfig(
  _prev: BatchImportResult | null,
  formData: FormData,
): Promise<BatchImportResult> {
  const raw = formData.get("payload");
  if (!raw) {
    return { success: false, imported: [], errors: [{ entity: "payload", row: 0, issues: [{ path: "payload", message: "Geen data ontvangen." }] }] };
  }

  let payload: FullImportPayload;
  try {
    payload = JSON.parse(raw.toString());
  } catch {
    return { success: false, imported: [], errors: [{ entity: "payload", row: 0, issues: [{ path: "payload", message: "Ongeldige JSON." }] }] };
  }

  const errors: { entity: string; row: number; issues: ValidationIssue[] }[] = [];
  const imported: { entity: string; count: number }[] = [];

  // Validate each entity type batch
  const batches: { name: string; items: unknown[] | undefined; schema: { safeParse: (x: unknown) => any } }[] = [
    { name: "legalEntities", items: payload.legalEntities, schema: LegalEntityInput },
    { name: "parentAccounts", items: payload.parentAccounts, schema: ParentAccountInput },
    { name: "portfolios", items: payload.portfolios, schema: PortfolioInput },
    { name: "managers", items: payload.managers, schema: ManagerInput },
    { name: "benchmarks", items: payload.benchmarks, schema: BenchmarkInput },
    { name: "models", items: payload.models, schema: ModelInput },
    { name: "classifications", items: payload.classifications, schema: ClassificationInput },
    { name: "strategies", items: payload.strategies, schema: StrategyInput },
    { name: "subStrategies", items: payload.subStrategies, schema: SubStrategyInput },
    { name: "accounts", items: payload.accounts, schema: AccountInput },
  ];

  for (const batch of batches) {
    if (!batch.items || batch.items.length === 0) continue;
    const result = validateBatch(batch.schema, batch.items, batch.name);
    imported.push({ entity: batch.name, count: result.count });
    for (const e of result.errors) {
      errors.push({ entity: batch.name, ...e });
    }
  }

  // For now, only validate — database writes are wired when TypeORM is integrated
  revalidatePath("/admin/client-config");
  revalidatePath("/admin/client-config/import");

  return {
    success: errors.length === 0,
    imported,
    errors,
  };
}
