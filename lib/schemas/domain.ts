/**
 * Domain model Zod schemas for BCM.
 *
 * These schemas define the shape of core domain objects and can be
 * used for both runtime validation and TypeScript type inference.
 *
 * @module schemas/domain
 */

import { z } from "zod";
import { ASSET_CLASSES } from "@/lib/types";

// ── Primitives ──────────────────────────────────────────────────────────────────

/** UUID v4 pattern (accepts any standard UUID variant). */
export const uuidSchema = z.string().uuid();

/**
 * ISO date string (YYYY-MM-DD).
 * Rejects non-date strings like empty strings, booleans, or objects.
 */
export const dateStringSchema = z.string().date();

/** Three-letter currency code, uppercased. */
export const currencyCodeSchema = z
  .string()
  .length(3, "Valuta moet een 3-lettercode zijn (bijv. EUR).")
  .toUpperCase();

/** A known asset class key. */
export const assetClassSchema = z.enum(ASSET_CLASSES, {
  message: "Kies een geldige asset class.",
});

// ── Domain objects ──────────────────────────────────────────────────────────────

/** @deprecated Replaced by client_config.benchmark. Use `clientConfigBenchmarkSchema` instead. */
export const benchmarkSchema = z.object({
  id: uuidSchema,
  code: z.string().min(1),
  name: z.string().min(1),
  assetClass: z.string().min(1),
  currency: currencyCodeSchema,
  cost: z.coerce.number().min(0),
  provider: z.string().min(1),
});

export type BenchmarkInput = z.infer<typeof benchmarkSchema>;

/** @deprecated Replaced by client_config.portfolio + client_config.account. */
export const portfolioSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1),
  externalReference: z.string().min(1),
  currentBenchmarkId: uuidSchema,
  wtpClassificationId: uuidSchema,
  assetClassId: uuidSchema,
  managerId: uuidSchema,
  benchmarkId: uuidSchema,
  assetClass: z.string().min(1),
  subAssetClass: z.string(),
});

export type PortfolioInput = z.infer<typeof portfolioSchema>;

/** @deprecated Replaced by the client_config schema entities. */
export const clientConfigSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1),
  externalReference: z.string().min(1),
  regelingType: z.string().optional(),
  assetClass: assetClassSchema.optional(),
  portfolios: z.array(portfolioSchema),
});

// ── Change-type domain ──────────────────────────────────────────────────────────

export const changeStatusSchema = z.enum([
  "draft",
  "submitted",
  "accepted",
  "in_progress",
  "processed",
  "validated",
]);

export type ChangeStatus = z.infer<typeof changeStatusSchema>;

/** Schema for a single ChangeItem (benchmark switch). */
export const changeItemSchema = z.object({
  portfolioId: uuidSchema,
  previousBenchmarkId: uuidSchema,
  requestedBenchmarkId: uuidSchema,
});

export type ChangeItem = z.infer<typeof changeItemSchema>;

/** Schema for a ChangeFieldValue pair. */
export const changeFieldValueSchema = z.object({
  fieldKey: z.string().min(1),
  istValue: z.unknown(),
  sollValue: z.unknown(),
});

export type ChangeFieldValue = z.infer<typeof changeFieldValueSchema>;

/** Schema for a ChangeRequest (write fields for creation). */
export const changeRequestCreateSchema = z.object({
  id: uuidSchema,
  reference: z.string().min(1),
  changeType: z.string().min(1),
  changeTypeId: uuidSchema,
  clientId: uuidSchema,
  requestedBy: z.string().min(1),
  rationale: z.string().min(1),
  effectiveDate: dateStringSchema,
  items: z.array(changeItemSchema),
  fields: z.array(changeFieldValueSchema),
  estimatedCost: z.number().optional(),
  estimatedCostCurrency: currencyCodeSchema.optional(),
  estimatedLeadDays: z.number().int().positive().optional(),
  stakeholderAssignments: z
    .array(
      z.object({
        stakeholderId: z.string().min(1),
        contact: z.string().min(1),
        notifiedAt: z.string().nullable(),
      }),
    )
    .optional(),
});

export type ChangeRequestCreate = z.infer<typeof changeRequestCreateSchema>;

// ── Processing outcome ──────────────────────────────────────────────────────────

export const processingOutcomeSchema = z.enum([
  "processed",
  "completed",
  "partial",
  "failed",
  "rejected",
]);

export type ProcessingOutcome = z.infer<typeof processingOutcomeSchema>;

// ── SLA ─────────────────────────────────────────────────────────────────────────

export const slaStatusSchema = z.enum(["ok", "at_risk", "overdue"]);

// ═════════════════════════════════════════════════════════════════════
// New data model — client_config schema (replaces the deprecated schemas above)
// ═════════════════════════════════════════════════════════════════════

/** Schema for client_config.legal_entity. */
export const clientConfigLegalEntitySchema = z.object({
  legalEntityId: z.number().int().positive(),
  legalName: z.string().max(100),
});

export type ClientConfigLegalEntity = z.infer<typeof clientConfigLegalEntitySchema>;

/** Schema for client_config.parent_account. */
export const clientConfigParentAccountSchema = z.object({
  parentAccountId: z.number().int().positive(),
  parentAccountCode: z.string().max(16),
  msaParentAccountCode: z.string().max(16).nullable(),
});

export type ClientConfigParentAccount = z.infer<typeof clientConfigParentAccountSchema>;

/** Schema for client_config.portfolio. */
export const clientConfigPortfolioSchema = z.object({
  portfolioId: z.number().int().positive(),
  portfolioCode: z.string().max(15),
  parentAccountId: z.number().int().positive().nullable(),
});

export type ClientConfigPortfolio = z.infer<typeof clientConfigPortfolioSchema>;

/** Schema for client_config.asset_class. */
export const clientConfigAssetClassSchema = z.object({
  assetClassId: z.number().int().positive(),
  assetClassCode: z.string().length(2),
  assetClassName: z.string().max(30),
});

export type ClientConfigAssetClass = z.infer<typeof clientConfigAssetClassSchema>;

/** Schema for client_config.sub_asset_class. */
export const clientConfigSubAssetClassSchema = z.object({
  subAssetClassId: z.number().int().positive(),
  assetClassId: z.number().int().positive(),
  subAssetClassCode: z.string().length(3),
  subAssetClassName: z.string().max(50),
});

export type ClientConfigSubAssetClass = z.infer<typeof clientConfigSubAssetClassSchema>;

/** Schema for client_config.manager. */
export const clientConfigManagerSchema = z.object({
  managerId: z.number().int().positive(),
  managerCode: z.string().length(3),
  managerName: z.string().max(50),
});

export type ClientConfigManager = z.infer<typeof clientConfigManagerSchema>;

/** Schema for client_config.benchmark. */
export const clientConfigBenchmarkSchema = z.object({
  benchmarkId: z.number().int().positive(),
  benchmarkCode: z.string().max(60),
  benchmarkName: z.string().max(100).nullable(),
  rimesCode: z.string().max(40).nullable(),
});

export type ClientConfigBenchmark = z.infer<typeof clientConfigBenchmarkSchema>;

/** Schema for client_config.model. */
export const clientConfigModelSchema = z.object({
  modelId: z.number().int().positive(),
  modelCode: z.string().max(10),
});

export type ClientConfigModel = z.infer<typeof clientConfigModelSchema>;

/** Schema for client_config.classification. */
export const clientConfigClassificationSchema = z.object({
  classificationId: z.number().int().positive(),
  classificationCode: z.string().max(10),
});

export type ClientConfigClassification = z.infer<typeof clientConfigClassificationSchema>;

/** Schema for client_config.strategy. */
export const clientConfigStrategySchema = z.object({
  strategyId: z.number().int().positive(),
  strategyName: z.string().max(30),
});

export type ClientConfigStrategy = z.infer<typeof clientConfigStrategySchema>;

/** Schema for client_config.sub_strategy. */
export const clientConfigSubStrategySchema = z.object({
  subStrategyId: z.number().int().positive(),
  strategyId: z.number().int().positive(),
  subStrategyName: z.string().max(50),
});

export type ClientConfigSubStrategy = z.infer<typeof clientConfigSubStrategySchema>;

/**
 * Schema for client_config.account.
 * The primary_account_id is a derived string matching the pattern
 * {portfolio_code}_{asset_class_code}{sub_asset_class_code}_{manager_code}.
 */
export const clientConfigAccountSchema = z.object({
  primaryAccountId: z.string().max(30),
  portfolioId: z.number().int().positive(),
  assetClassId: z.number().int().positive(),
  subAssetClassId: z.number().int().positive(),
  managerId: z.number().int().positive(),
  legalEntityId: z.number().int().positive().nullable(),
  additionalCode: z.string().max(3).nullable(),
  longName: z.string().max(50),
  shortName: z.string().max(30),
  modelId: z.number().int().positive().nullable(),
  classificationId: z.number().int().positive().nullable(),
  strategyId: z.number().int().positive(),
  subStrategyId: z.number().int().positive(),
  benchmarkId: z.number().int().positive().nullable(),
});

export type ClientConfigAccount = z.infer<typeof clientConfigAccountSchema>;

export const clientConfigNpcClassificationSchema = z.object({
  npcClassificationId: z.number().int().positive(),
  classificationName: z.string().max(80),
});
export type ClientConfigNpcClassification = z.infer<typeof clientConfigNpcClassificationSchema>;

export const clientConfigPortfolioConfigurationSchema = z.object({
  primaryAccountId: z.string().max(30),
  portfolioCode: z.string().max(15),
  assetClassCode: z.string().length(2),
  subAssetClassCode: z.string().max(3),
  managerCode: z.string().length(3),
  benchmarkCode: z.string().max(60),
  npcClassificationId: z.number().int().positive(),
  longName: z.string().max(255),
  shortName: z.string().max(100),
  activeInd: z.boolean().default(true),
  effectiveFrom: z.coerce.date(),
  effectiveUntil: z.coerce.date().nullable(),
  changeRequestId: z.string().uuid().nullable().optional(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});
export type ClientConfigPortfolioConfiguration = z.infer<typeof clientConfigPortfolioConfigurationSchema>;

export const clientConfigChangePortfolioConfigurationSchema = z.object({
  id: z.number().int().positive().optional(),
  changeRequestId: z.string().uuid(),
  actionType: z.enum(["CREATE","UPDATE","DELETE"]),
  portfolioCode: z.string().max(15),
  assetClassCode: z.string().length(2),
  subAssetClassCode: z.string().max(3).default(""),
  managerCode: z.string().length(3),
  benchmarkCode: z.string().max(60).default(""),
  npcClassificationId: z.number().int().positive(),
  longName: z.string().max(255),
  shortName: z.string().max(100),
  effectiveFrom: z.coerce.date(),
  effectiveUntil: z.coerce.date().nullable(),
  createdAt: z.coerce.date().optional(),
});
export type ClientConfigChangePortfolioConfiguration = z.infer<typeof clientConfigChangePortfolioConfigurationSchema>;