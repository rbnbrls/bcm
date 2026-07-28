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

/** Schema for a Benchmark catalog entry. */
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

/** Schema for a Portfolio (full shape including relations). */
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

/** Schema for a ClientConfig. */
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
