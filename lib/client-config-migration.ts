import type {
  ClientConfigAssetClass,
  ClientConfigBenchmark,
  ClientConfigManager,
  ClientConfigParentAccount,
  ClientConfigPortfolio,
  ClientConfigPortfolioConfiguration,
  ClientConfigNpcClassification,
} from "@/lib/schemas/domain";
import { z } from "zod";
import {
  clientConfigAssetClassSchema,
  clientConfigBenchmarkSchema,
  clientConfigManagerSchema,
  clientConfigNpcClassificationSchema,
  clientConfigParentAccountSchema,
  clientConfigPortfolioConfigurationSchema,
  clientConfigPortfolioSchema,
  type ClientConfigAssetClass as SchemaClientConfigAssetClass,
  type ClientConfigBenchmark as SchemaClientConfigBenchmark,
  type ClientConfigManager as SchemaClientConfigManager,
  type ClientConfigNpcClassification as SchemaClientConfigNpcClassification,
  type ClientConfigParentAccount as SchemaClientConfigParentAccount,
  type ClientConfigPortfolio as SchemaClientConfigPortfolio,
} from "@/lib/schemas/domain";
import { generatePrimaryAccountId, lookupCodes } from "@/lib/portfolio-config";

// ── Types ──────────────────────────────────────────────────────────────────────

export type LegacyFlatRecord = {
  clientCode?: string;
  portfolioCode: string;
  assetClassName: string;
  subAssetClassName: string;
  managerCode: string;
  managerName: string;
  benchmarkCode: string;
  benchmarkName: string;
  classification: string;
  longName: string;
  shortName: string;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  active?: boolean;
};

export type MigrationLogEntry = {
  step: "clean" | "deduplicate" | "validate" | "register_references" | "build_configurations" | "rollback";
  status: "started" | "success" | "failure";
  processedRecords?: number;
  message?: string;
  startedAt: string;
  endedAt?: string;
};

export type MigrationResult<T> =
  | { ok: true; result: T; log: MigrationLogEntry[] }
  | { ok: false; result: null; log: MigrationLogEntry[]; error?: string };

// ── Helpers ────────────────────────────────────────────────────────────────────

function nowIso() {
  return new Date().toISOString();
}

function logEvent(
  log: MigrationLogEntry[],
  entry: Omit<MigrationLogEntry, "startedAt" | "endedAt"> & { startedAt?: string }
): MigrationLogEntry[] {
  const startedAt = entry.startedAt ?? nowIso();
  const current: MigrationLogEntry = {
    ...entry,
    startedAt,
    status: entry.status === "started" ? "started" : entry.status,
  };
  if (entry.status !== "started") {
    current.endedAt = nowIso();
  }
  log.push(current);
  return log;
}

function safeDate(v: unknown): Date {
  if (typeof v === "string" && v.trim().length > 0) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

// ── Business rule fixtures ─────────────────────────────────────────────────────

const ASSET_CLASS_OPTIONS = [
  { assetClassName: "CASH", assetClassCode: "CS" },
  { assetClassName: "EQUITIES", assetClassCode: "EQ" },
  { assetClassName: "ALTERNATIVES", assetClassCode: "AL" },
  { assetClassName: "REAL_ASSETS", assetClassCode: "RA" },
  { assetClassName: "FIXED_INCOME", assetClassCode: "FI" },
  { assetClassName: "MULTI_ASSETS", assetClassCode: "MA" },
  { assetClassName: "OVERLAY", assetClassCode: "OV" },
  { assetClassName: "IMPACT", assetClassCode: "IM" },
] as const;

const DEFAULT_NPC_CLASSIFICATIONS = [
  { classificationName: "Match", npcClassificationId: 1 },
  { classificationName: "Return", npcClassificationId: 2 },
  { classificationName: "Opbouw", npcClassificationId: 3 },
] as const;

const DEFAULT_BENCHMARK_CODE = "LEGACY_MIGRATION_BENCH";
const DEFAULT_MANAGER_CODE = "UNK";

// ── Step 1: cleanse and normalize input ───────────────────────────────────────

export function cleanseRecords(records: unknown[]): MigrationResult<LegacyFlatRecord[]> {
  const log: MigrationLogEntry[] = [];
  logEvent(log, { step: "clean", status: "started" });

  if (!Array.isArray(records)) {
    logEvent(log, { step: "clean", status: "failure", message: "Input is not an array", processedRecords: 0 });
    return { ok: false, result: null, log, error: "Input is not an array" };
  }

  const normalized: LegacyFlatRecord[] = [];
  for (let i = 0; i < records.length; i++) {
    const raw = records[i];
    if (typeof raw !== "object" || raw === null) continue;

    const record = raw as Record<string, unknown>;
    const portfolioCode = typeof record.portfolioCode === "string" ? record.portfolioCode.trim() : "";
    const clientCode = typeof record.clientCode === "string" ? record.clientCode.trim().toUpperCase() : portfolioCode.slice(0, 3).toUpperCase();
    const assetClassName = typeof record.assetClassName === "string" ? record.assetClassName.trim() : "";
    const subAssetClassName = typeof record.subAssetClassName === "string" ? record.subAssetClassName.trim() : "";
    const managerCode = typeof record.managerCode === "string" ? record.managerCode.trim().toUpperCase() : "";
    const managerName = typeof record.managerName === "string" ? record.managerName.trim() : "";
    const benchmarkCode = typeof record.benchmarkCode === "string" ? record.benchmarkCode.trim() : "";
    const benchmarkName = typeof record.benchmarkName === "string" ? record.benchmarkName.trim() : "";
    const classification = typeof record.classification === "string" ? record.classification.trim() : "";
    const longName = typeof record.longName === "string" ? record.longName.trim() : "";
    const shortName = typeof record.shortName === "string" ? record.shortName.trim() : "";
    const effectiveFrom = typeof record.effectiveFrom === "string" ? record.effectiveFrom.trim() : new Date().toISOString().slice(0, 10);
    const effectiveUntil = typeof record.effectiveUntil === "string" ? record.effectiveUntil.trim() : null;
    const active = typeof record.active === "boolean" ? record.active : true;

    if (!portfolioCode || !assetClassName || !subAssetClassName || !managerCode) {
      continue;
    }

    normalized.push({
      portfolioCode,
      clientCode,
      assetClassName,
      subAssetClassName,
      managerCode,
      managerName: managerName || `${managerCode} migrated manager`,
      benchmarkCode: benchmarkCode || DEFAULT_BENCHMARK_CODE,
      benchmarkName: benchmarkName || `${DEFAULT_BENCHMARK_CODE} name`,
      classification: classification || "Return",
      longName: longName || `${portfolioCode} ${assetClassName} ${managerCode}`,
      shortName: shortName || `${portfolioCode} ${assetClassName} ${managerCode}`,
      effectiveFrom,
      effectiveUntil,
      active,
    });
  }

  logEvent(log, { step: "clean", status: "success", processedRecords: normalized.length });
  return { ok: true, result: normalized, log };
}

// ── Step 2: deduplicate on business key ──────────────────────────────────────

export function deduplicateRecords(
  records: LegacyFlatRecord[]
): MigrationResult<LegacyFlatRecord[]> {
  const log: MigrationLogEntry[] = [];
  logEvent(log, { step: "deduplicate", status: "started" });

  const seen = new Set<string>();
  const unique: LegacyFlatRecord[] = [];

  for (const record of records) {
    const codes = lookupCodes(record.assetClassName, record.subAssetClassName);
    const assetClassCode = codes?.assetClassCode ?? "??";
    const subAssetClassCode = codes?.subAssetClassCode ?? "???";
    const clientCode = record.clientCode ?? record.portfolioCode.slice(0, 3);
    const businessKey = `${clientCode}*${assetClassCode}${subAssetClassCode}*${record.managerCode}`;
    const upper = businessKey.toUpperCase();

    if (seen.has(upper)) continue;
    seen.add(upper);
    unique.push(record);
  }

  logEvent(log, { step: "deduplicate", status: "success", processedRecords: unique.length });
  return { ok: true, result: unique, log };
}

// ── Step 3: validate and enrich raw records → target payloads ─────────────────

export function validateAndEnrich(
  records: LegacyFlatRecord[],
  existingNpcClassifications: ClientConfigNpcClassification[] = []
): MigrationResult<{ configurations: ClientConfigPortfolioConfiguration[]; dropped: number }> {
  const log: MigrationLogEntry[] = [];
  logEvent(log, { step: "validate", status: "started" });

  const allClassifications = [
    ...existingNpcClassifications,
    ...DEFAULT_NPC_CLASSIFICATIONS,
  ];

  const byClassification = new Map<string, { npcClassificationId: number; classificationName: string }>();
  for (const c of allClassifications) {
    byClassification.set(c.classificationName.trim().toLowerCase(), c);
  }

  const configurations: ClientConfigPortfolioConfiguration[] = [];
  let dropped = 0;

  for (const record of records) {
    const codes = lookupCodes(record.assetClassName, record.subAssetClassName);
    if (!codes) {
      dropped++;
      logEvent(log, {
        step: "validate",
        status: "failure",
        message: `Unknown asset/sub-asset for portfolio ${record.portfolioCode}: ${record.assetClassName} / ${record.subAssetClassName}`,
        processedRecords: configurations.length,
      });
      continue;
    }

    const assetClassEntry = ASSET_CLASS_OPTIONS.find(
      (x) => x.assetClassName === record.assetClassName
    );
    if (!assetClassEntry) {
      dropped++;
      continue;
    }

    const classificationCandidate = byClassification.get(record.classification.toLowerCase());
    const npcClassification: ClientConfigNpcClassification = classificationCandidate
      ? classificationCandidate
      : { npcClassificationId: 0, classificationName: record.classification };

    const primaryAccountId = generatePrimaryAccountId(
      record.clientCode ?? record.portfolioCode.slice(0, 3),
      codes.assetClassCode,
      codes.subAssetClassCode,
      record.managerCode
    );

    const effectiveFromDate = safeDate(record.effectiveFrom);
    const effectiveUntilDate = record.effectiveUntil ? safeDate(record.effectiveUntil) : null;

    const rawPayload: ClientConfigPortfolioConfiguration = {
      primaryAccountId,
      clientCode: record.clientCode ?? record.portfolioCode.slice(0, 3),
      portfolioCode: record.portfolioCode,
      assetClassCode: codes.assetClassCode,
      subAssetClassCode: codes.subAssetClassCode,
      managerCode: record.managerCode,
      benchmarkCode: record.benchmarkCode,
      npcClassificationId: Number(npcClassification.npcClassificationId || 0),
      longName: record.longName,
      shortName: record.shortName,
      activeInd: Boolean(record.active),
      effectiveFrom: effectiveFromDate,
      effectiveUntil: effectiveUntilDate,
      changeRequestId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const parsed = clientConfigPortfolioConfigurationSchema.safeParse(rawPayload);
    if (!parsed.success) {
      dropped++;
      logEvent(log, {
        step: "validate",
        status: "failure",
        message: `Validation failed for ${primaryAccountId}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
        processedRecords: configurations.length,
      });
      continue;
    }

    configurations.push(parsed.data);
  }

  logEvent(log, { step: "validate", status: "success", processedRecords: configurations.length });
  return { ok: true, result: { configurations, dropped }, log };
}

// ── Step 4: collect reference data for foreign keys ─────────────────────────

export function collectReferenceData(
  configurations: ClientConfigPortfolioConfiguration[]
): {
  portfolios: { portfolioCode: string; parentAccountId: number | null }[];
  assetClasses: { assetClassId: number; assetClassCode: string; assetClassName: string }[];
  managers: { managerId: number; managerCode: string; managerName: string }[];
  benchmarks: { benchmarkId: number; benchmarkCode: string; benchmarkName: string; rimesCode: string | null }[];
  npcClassifications: { npcClassificationId: number; classificationName: string }[];
} {
  let pid = 1;
  let assetClassId = 1;
  let managerId = 1;
  let benchmarkId = 1;
  const assetClassCodeMap = new Map<string, { assetClassId: number; assetClassName: string }>();
  for (const opt of ASSET_CLASS_OPTIONS) {
    assetClassCodeMap.set(opt.assetClassCode, { assetClassId, assetClassName: opt.assetClassName });
    assetClassId++;
  }

  const portfolios = new Map<string, { portfolioCode: string; parentAccountId: number | null }>();
  const assetClasses: { assetClassId: number; assetClassCode: string; assetClassName: string }[] = [];
  const managers = new Map<string, { managerId: number; managerCode: string; managerName: string }>();
  const benchmarks = new Map<string, { benchmarkId: number; benchmarkCode: string; benchmarkName: string; rimesCode: string | null }>();
  const npcClassifications = new Map<string, { npcClassificationId: number; classificationName: string }>();

  for (const item of configurations) {
    if (!portfolios.has(item.portfolioCode)) {
      portfolios.set(item.portfolioCode, { portfolioCode: item.portfolioCode, parentAccountId: null });
      pid++;
    }

    const assetMeta = assetClassCodeMap.get(item.assetClassCode);
    if (assetMeta && !assetClasses.some((a) => a.assetClassCode === item.assetClassCode)) {
      assetClasses.push({ assetClassId: assetMeta.assetClassId, assetClassCode: item.assetClassCode, assetClassName: assetMeta.assetClassName });
    }

    if (!managers.has(item.managerCode)) {
      managers.set(item.managerCode, { managerId, managerCode: item.managerCode, managerName: item.managerCode });
      managerId++;
    }

    if (!benchmarks.has(item.benchmarkCode)) {
      benchmarks.set(item.benchmarkCode, { benchmarkId, benchmarkCode: item.benchmarkCode, benchmarkName: item.benchmarkCode, rimesCode: null });
      benchmarkId++;
    }

    npcClassifications.set(
      String(item.npcClassificationId),
      { npcClassificationId: item.npcClassificationId, classificationName: "" }
    );
  }

  return {
    portfolios: Array.from(portfolios.values()),
    assetClasses,
    managers: Array.from(managers.values()),
    benchmarks: Array.from(benchmarks.values()),
    npcClassifications: Array.from(npcClassifications.values()),
  };
}

// ── Step 5: build normalized payloads ────────────────────────────────────────

export type NormalizedMigrationResult = {
  configurations: ClientConfigPortfolioConfiguration[];
  portfolios: { portfolioCode: string; parentAccountId: number | null }[];
  assetClasses: { assetClassId: number; assetClassCode: string; assetClassName: string }[];
  managers: { managerId: number; managerCode: string; managerName: string }[];
  benchmarks: { benchmarkId: number; benchmarkCode: string; benchmarkName: string; rimesCode: string | null }[];
  npcClassifications: { npcClassificationId: number; classificationName: string }[];
  droppedDuringValidation: number;
};

export function buildNormalizedPayload(
  records: LegacyFlatRecord[],
  existingNpcClassifications: ClientConfigNpcClassification[] = []
): MigrationResult<NormalizedMigrationResult> {
  const log: MigrationLogEntry[] = [];
  logEvent(log, { step: "register_references", status: "started" });

  const cleaned = cleanseRecords(records);
  if (!cleaned.ok) return { ok: false as const, result: null, log: [...log, ...cleaned.log], error: cleaned.error ?? "cleanse failed" };

  const deduped = deduplicateRecords(cleaned.result!);
  if (!deduped.ok) return { ok: false as const, result: null, log: [...log, ...deduped.log], error: "deduplication failed" };

  logEvent(log, { step: "register_references", status: "success" });
  logEvent(log, { step: "build_configurations", status: "started" });

  const validation = validateAndEnrich(deduped.result!, existingNpcClassifications);
  const builtLog = [...log, ...validation.log];
  if (!validation.ok) return { ok: false as const, result: null, log: builtLog, error: validation.error ?? "validation failed" };

  const configurations = validation.result!.configurations;
  const droppedDuringValidation = validation.result!.dropped;
  const references = collectReferenceData(configurations);

  const payload: NormalizedMigrationResult = {
    configurations,
    droppedDuringValidation,
    ...references,
  };

  logEvent(builtLog, { step: "build_configurations", status: "success", processedRecords: configurations.length });
  return { ok: true as const, result: payload, log: builtLog };
}

// ── Step 6: rollback helper ───────────────────────────────────────────────────

export type RollbackContract = {
  deleteConfigurationPrimaryAccountIds: string[];
};

export function buildRollbackContract(
  configurations: ClientConfigPortfolioConfiguration[]
): RollbackContract {
  return {
    deleteConfigurationPrimaryAccountIds: configurations.map((x) => x.primaryAccountId),
  };
}

// ── Step 7: simulated migration runner with rollback plan ────────────────────

export type MigrationRunnerInput = {
  legacyRecords: LegacyFlatRecord[];
  existingNpcClassifications: ClientConfigNpcClassification[];
  dryRun?: boolean;
};

export type MigrationRunnerOutput = MigrationResult<NormalizedMigrationResult & { rollback: RollbackContract }>;

export function runMigration({
  legacyRecords,
  existingNpcClassifications,
  dryRun = false,
}: MigrationRunnerInput): MigrationRunnerOutput {
  const log: MigrationLogEntry[] = [];

  const built = buildNormalizedPayload(legacyRecords, existingNpcClassifications);
  if (!built.ok) {
    logEvent(log, { step: "rollback", status: "success", message: "No changes applied because build failed" });
    return { ok: false as const, result: null, log: [...log, ...built.log], error: built.error ?? "migration build failed" };
  }

  const payload = built.result!;
  const rollback = buildRollbackContract(payload.configurations);

  if (dryRun) {
    logEvent(log, { step: "rollback", status: "success", message: "Dry-run complete; no database mutations performed" });
    return { ok: true as const, result: { ...payload, rollback }, log: [...log, ...built.log] };
  }

  // In a future implementation this section executes SQL/TypeORM writes against
  // the client_config tables. This service currently provides the prepared,
  // validated and deduplicated payload plus the exact rollback plan so that
  // a caller can apply it transactionally.
  logEvent(log, { step: "rollback", status: "success", message: "Apply payload prepared; caller owns DB transaction" });

  return { ok: true as const, result: { ...payload, rollback }, log: [...log, ...built.log] };
}
