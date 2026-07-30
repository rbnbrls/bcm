/**
 * Client Configuration Migration Service
 *
 * Transforms legacy flat account data into the normalized 3NF
 * portfolio_configuration structure. Designed for one-time data migration
 * from the old `client_config.account` table (or an equivalent import).
 *
 * Architecture:
 *   1. Accept an array of LegacyAccountRow (flat/denormalised input)
 *   2. Look up each dimension's code via the reference data catalog
 *   3. Build the primary_account_id using the canonical generator
 *   4. Validate every field against the existing validation rules
 *   5. Collect valid rows into the target output, collect errors separately
 *   6. Generate a rollback contract (original → new mapping) for reversal
 *
 * The output of this function is designed to be consumed by
 * applyChangePortfolioConfigurations() (for small batch migrations via the
 * change-process) or written directly to portfolio_configuration with the
 * GUC bypass during the initial data migration.
 */

import { generatePrimaryAccountId, lookupCodes } from "@/lib/portfolio-config";
import type { ClientConfigReferenceData } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────
// Input type — matches the legacy flat column layout
// ─────────────────────────────────────────────────────────────────────────

export interface LegacyAccountRow {
  /** Existing primary_account_id (may differ from canonical form) */
  primaryAccountId: string;
  portfolioCode: string;
  assetClassName: string;
  subAssetClassName: string;
  managerCode: string;
  benchmarkCode: string;
  npcClassificationName: string;
  longName: string;
  shortName: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  activeInd: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// Output types
// ─────────────────────────────────────────────────────────────────────────

export interface NormalizedConfiguration {
  primaryAccountId: string;
  portfolioCode: string;
  assetClassCode: string;
  subAssetClassCode: string;
  managerCode: string;
  benchmarkCode: string;
  npcClassificationId: number;
  longName: string;
  shortName: string;
  activeInd: boolean;
  effectiveFrom: string;
  effectiveUntil: string | null;
}

export interface RollbackEntry {
  /** Original primary_account_id from the legacy row. */
  originalPrimaryAccountId: string;
  /** Canonical primary_account_id in the new system. */
  newPrimaryAccountId: string;
  /** Action required to reverse the migration for this row. */
  rollbackAction: "DELETE";
}

export interface MigrationResult {
  /** Successfully transformed portfolio_configuration rows (ready for insert). */
  configurations: NormalizedConfiguration[];
  /** Validation errors — rows that could not be migrated. */
  errors: string[];
  /** Non-fatal warnings (e.g. duplicates resolved). */
  warnings: string[];
  /** Rollback contract: one entry per successfully migrated row. */
  rollback: RollbackEntry[];
}

// ─────────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────────

function isValidLongName(value: string): boolean {
  return value.length >= 1 && value.length <= 255 && !value.includes("\r") && !value.includes("\n");
}

function isValidShortName(value: string): boolean {
  return value.length >= 1 && value.length <= 100 && !value.includes("\r") && !value.includes("\n");
}

function isValidDateRange(from: string, until: string | null): boolean {
  if (!until) return true;
  return new Date(until) >= new Date(from);
}

// ─────────────────────────────────────────────────────────────────────────
// Main migration function
// ─────────────────────────────────────────────────────────────────────────

/**
 * Migrate an array of legacy (flat) account rows to the normalized 3NF
 * portfolio_configuration structure.
 *
 * Each row is independently validated. Valid rows are collected in
 * `configurations`; rows that fail validation are reported in `errors`.
 * Warnings capture non-fatal issues like duplicate detection.
 *
 * @param rows  Array of legacy account rows (e.g. from client_config.account
 *              or a CSV/JSON import).
 * @param ref   Reference data catalog containing all dimension lookups.
 * @returns     A MigrationResult with the validated configurations,
 *              error/warning messages, and a rollback contract.
 */
export function migrateLegacyAccount(
  rows: LegacyAccountRow[],
  ref: ClientConfigReferenceData,
): MigrationResult {
  const configurations: NormalizedConfiguration[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const rollback: RollbackEntry[] = [];
  const seenPrimaryAccountIds = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowLabel = `Row ${i + 1} (${row.primaryAccountId || "<no id>"})`;

    // ── Validate required fields ───────────────────────────────────────
    if (!row.portfolioCode || row.portfolioCode.trim().length === 0) {
      errors.push(`${rowLabel}: portfolioCode is verplicht.`);
      continue;
    }
    if (!row.assetClassName || row.assetClassName.trim().length === 0) {
      errors.push(`${rowLabel}: assetClassName is verplicht.`);
      continue;
    }
    if (!row.subAssetClassName || row.subAssetClassName.trim().length === 0) {
      errors.push(`${rowLabel}: subAssetClassName is verplicht.`);
      continue;
    }
    if (!row.managerCode || row.managerCode.trim().length === 0) {
      errors.push(`${rowLabel}: managerCode is verplicht.`);
      continue;
    }
    if (!row.benchmarkCode || row.benchmarkCode.trim().length === 0) {
      errors.push(`${rowLabel}: benchmarkCode is verplicht.`);
      continue;
    }
    if (!row.longName || row.longName.trim().length === 0) {
      errors.push(`${rowLabel}: longName is verplicht.`);
      continue;
    }
    if (!row.shortName || row.shortName.trim().length === 0) {
      errors.push(`${rowLabel}: shortName is verplicht.`);
      continue;
    }
    if (!row.effectiveFrom) {
      errors.push(`${rowLabel}: effectiveFrom is verplicht.`);
      continue;
    }

    // ── Format validations ─────────────────────────────────────────────
    if (!isValidLongName(row.longName)) {
      errors.push(`${rowLabel}: longName moet 1-255 karakters zijn zonder regeleindes.`);
      continue;
    }
    if (!isValidShortName(row.shortName)) {
      errors.push(`${rowLabel}: shortName moet 1-100 karakters zijn zonder regeleindes.`);
      continue;
    }
    if (!isValidDateRange(row.effectiveFrom, row.effectiveUntil)) {
      errors.push(`${rowLabel}: effectiveUntil mag niet voor effectiveFrom liggen.`);
      continue;
    }

    // ── Look up dimension codes ────────────────────────────────────────
    const codes = lookupCodes(row.assetClassName, row.subAssetClassName);
    if (!codes) {
      errors.push(
        `${rowLabel}: Onbekende combinatie asset class "${row.assetClassName}" / sub asset class "${row.subAssetClassName}".`,
      );
      continue;
    }

    // Manager code validation
    const manager = ref.managers.find(
      (m) => m.managerCode.toUpperCase() === row.managerCode.toUpperCase(),
    );
    if (!manager) {
      errors.push(`${rowLabel}: Onbekende manager code "${row.managerCode}".`);
      continue;
    }

    // Benchmark code validation
    const benchmark = ref.benchmarks.find(
      (b) => b.benchmarkCode.toUpperCase() === row.benchmarkCode.toUpperCase(),
    );
    if (!benchmark) {
      errors.push(`${rowLabel}: Onbekende benchmark code "${row.benchmarkCode}".`);
      continue;
    }

    // NPC classification lookup (by name)
    const npc = ref.npcClassifications.find(
      (n) => n.classificationName === row.npcClassificationName,
    );
    if (!npc) {
      errors.push(
        `${rowLabel}: Onbekende NPC classification "${row.npcClassificationName}".`,
      );
      continue;
    }

    // ── Build canonical primary_account_id ─────────────────────────────
    const canonicalId = generatePrimaryAccountId(
      row.portfolioCode,
      codes.assetClassCode,
      codes.subAssetClassCode,
      row.managerCode,
    );

    // ── Duplicate detection ────────────────────────────────────────────
    if (seenPrimaryAccountIds.has(canonicalId)) {
      warnings.push(
        `${rowLabel}: Duplicate primary_account_id "${canonicalId}" overgeslagen.`,
      );
      continue;
    }
    seenPrimaryAccountIds.add(canonicalId);

    // ── Build normalized configuration row ─────────────────────────────
    configurations.push({
      primaryAccountId: canonicalId,
      portfolioCode: row.portfolioCode.toUpperCase(),
      assetClassCode: codes.assetClassCode,
      subAssetClassCode: codes.subAssetClassCode,
      managerCode: row.managerCode.toUpperCase(),
      benchmarkCode: row.benchmarkCode.toUpperCase(),
      npcClassificationId: npc.npcClassificationId,
      longName: row.longName,
      shortName: row.shortName,
      activeInd: row.activeInd,
      effectiveFrom: row.effectiveFrom,
      effectiveUntil: row.effectiveUntil,
    });

    // ── Build rollback entry ───────────────────────────────────────────
    rollback.push({
      originalPrimaryAccountId: row.primaryAccountId,
      newPrimaryAccountId: canonicalId,
      rollbackAction: "DELETE",
    });
  }

  return { configurations, errors, warnings, rollback };
}
