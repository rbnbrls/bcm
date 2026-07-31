/**
 * Client config input validation schemas.
 *
 * Authoritative input schemas for the client_config schema, derived from the
 * validation rules in db/clientconfig_validation.ts. These schemas enforce
 * format constraints, required fields, and business logic (e.g. asset class /
 * sub-asset-class pair validation) for API input and database writes.
 *
 * @module schemas/clientConfigInput
 */

import { z } from "zod";
import {
  ASSET_CLASS_VALUES,
  ASSET_SUB_ASSET_OPTIONS,
  PARENT_ONLY_ASSET_CLASSES,
} from "@/lib/asset-classes";

export {
  ASSET_CLASS_VALUES,
  ASSET_SUB_ASSET_OPTIONS,
  PARENT_ONLY_ASSET_CLASSES,
} from "@/lib/asset-classes";

// ═════════════════════════════════════════════════════════════════════
// Reference data — asset class / sub-asset-class hierarchy
// ═════════════════════════════════════════════════════════════════════

// ── Derived helpers ───────────────────────────────────────────────

/**
 * Zod enum that accepts only known asset class names.
 */
export const AssetClassValue = z.enum(ASSET_CLASS_VALUES);

/**
 * Zod refinement that checks whether a sub-asset-class value exists
 * in the known hierarchy at all (regardless of parent).
 */
export const SubAssetClassValue = z.string().superRefine((value, ctx) => {
  if (!ASSET_SUB_ASSET_OPTIONS.some((x) => x.subAssetClass === value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Onbekende sub asset class",
    });
  }
});

/**
 * Cross-validates that a given asset class + sub-asset-class pair
 * exists in the allowed hierarchy.
 */
export const AssetSubAssetSelection = z.object({
  assetClass: AssetClassValue,
  subAssetClass: SubAssetClassValue.nullable(),
}).superRefine((value, ctx) => {
  if (PARENT_ONLY_ASSET_CLASSES.includes(value.assetClass)) {
    if (value.subAssetClass !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subAssetClass"],
        message: "Parent-only asset classes hebben geen sub asset class",
      });
    }
    return;
  }

  if (value.subAssetClass === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["subAssetClass"],
      message: "Sub asset class is verplicht voor de gekozen asset class",
    });
    return;
  }

  if (!ASSET_SUB_ASSET_OPTIONS.some(
    (x) => x.assetClass === value.assetClass && x.subAssetClass === value.subAssetClass,
  )) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["subAssetClass"],
      message: "Sub asset class is niet beschikbaar voor de gekozen asset class",
    });
  }
});

export type AssetSubAssetSelectionType = z.infer<typeof AssetSubAssetSelection>;

// ═════════════════════════════════════════════════════════════════════
// Reusable format helpers
// ═════════════════════════════════════════════════════════════════════

/**
 * Single-line text: minimum 1, maximum `max` characters, no \r or \n.
 */
const singleLine = (max: number) =>
  z.string().min(1).max(max).regex(/^[^\r\n]+$/);

/**
 * Nullable/optional variant of singleLine.
 */
const nullableSingleLine = (max: number) =>
  singleLine(max).nullable().optional();

// ═════════════════════════════════════════════════════════════════════
// Input schemas (one per client_config table)
// ═════════════════════════════════════════════════════════════════════

/**
 * Input schema for client_config.legal_entity.
 * - legalName: required, 1-100 chars, no newlines
 */
export const LegalEntityInput = z.object({
  legalName: singleLine(100),
});

export type LegalEntityInput = z.infer<typeof LegalEntityInput>;

/**
 * Input schema for client_config.parent_account.
 * - parentAccountCode: uppercase alphanumeric + underscores, max 16 chars
 * - msaParentAccountCode: optional, same pattern as parentAccountCode
 */
export const ParentAccountInput = z.object({
  parentAccountCode: z.string().max(16).regex(/^[A-Z0-9]+(?:_[A-Z0-9]+)*$/),
  msaParentAccountCode: z.string().max(16).regex(/^[A-Z0-9]+(?:_[A-Z0-9]+)*$/).nullable().optional(),
});

export type ParentAccountInput = z.infer<typeof ParentAccountInput>;

/**
 * Input schema for client_config.client.
 * - clientCode: 1-3 uppercase alphanumeric chars
 * - clientName: required, 1-100 chars, no newlines
 */
export const ClientInput = z.object({
  clientCode: z.string().regex(/^[A-Z0-9]{1,3}$/),
  clientName: singleLine(100),
});

export type ClientInput = z.infer<typeof ClientInput>;

/**
 * Input schema for client_config.portfolio.
 * - portfolioCode: 2-15 uppercase alphanumeric chars
 * - parentAccountId: optional positive integer (coerced from string)
 */
export const PortfolioInput = z.object({
  portfolioCode: z.string().regex(/^[A-Z0-9]{2,15}$/),
  parentAccountId: z.coerce.number().int().positive().nullable().optional(),
});

export type PortfolioInput = z.infer<typeof PortfolioInput>;

/**
 * Input schema for client_config.manager.
 * - managerCode: exactly 3 uppercase alphanumeric chars
 * - managerName: starts with alphanumeric, supports common name chars, max 50
 */
export const ManagerInput = z.object({
  managerCode: z.string().regex(/^[A-Z0-9]{3}$/),
  managerName: z.string().regex(/^[A-Z0-9][A-Z0-9 &/().+'-]{1,49}$/),
});

export type ManagerInput = z.infer<typeof ManagerInput>;

/**
 * Input schema for client_config.benchmark.
 * - benchmarkCode: required, 1-60 chars, no newlines
 * - benchmarkName: optional, max 100 chars
 * - rimesCode: optional, max 40 chars
 */
export const BenchmarkInput = z.object({
  benchmarkCode: singleLine(60),
  benchmarkName: nullableSingleLine(100),
  rimesCode: nullableSingleLine(40),
});

export type BenchmarkInput = z.infer<typeof BenchmarkInput>;

/**
 * Input schema for client_config.model.
 * - modelCode: uppercase alphanumeric, spaces, underscores, hyphens; 3-10 chars
 */
export const ModelInput = z.object({
  modelCode: z.string().regex(/^[A-Z0-9][A-Z0-9 _-]{2,9}$/),
});

export type ModelInput = z.infer<typeof ModelInput>;

/**
 * Input schema for client_config.classification.
 * - classificationCode: alphanumeric, spaces, slashes, underscores, hyphens; 2-10 chars
 */
export const ClassificationInput = z.object({
  classificationCode: z.string().regex(/^[A-Z0-9][A-Z0-9 /_-]{1,9}$/),
});

export type ClassificationInput = z.infer<typeof ClassificationInput>;

/**
 * Input schema for client_config.strategy.
 * - strategyName: starts with uppercase letter, alphanumeric/underscore/space; 3-30 chars
 */
export const StrategyInput = z.object({
  strategyName: z.string().regex(/^[A-Z][A-Z0-9_ ]{2,29}$/),
});

export type StrategyInput = z.infer<typeof StrategyInput>;

/**
 * Input schema for client_config.sub_strategy.
 * - strategyId: positive integer (coerced)
 * - subStrategyName: starts with alphanumeric, supports special chars; 3-50 chars
 */
export const SubStrategyInput = z.object({
  strategyId: z.coerce.number().int().positive(),
  subStrategyName: z.string().regex(/^[A-Z0-9][A-Z0-9 &/_+.-]{2,49}$/),
});

export type SubStrategyInput = z.infer<typeof SubStrategyInput>;

/**
 * Input schema for client_config.account.
 * Validates the full account input including the primary_account_id format
 * (client_code + asset_class_code + sub_asset_class_code + manager_code)
 * and all FK references.
 */
export const AccountInput = z.object({
  primaryAccountId: z.string().regex(/^[A-Z0-9]{1,3}\*[A-Z]{2}[A-Z]{3}\*[A-Z0-9]{3}$/),
  portfolioId: z.coerce.number().int().positive(),
  assetClassId: z.coerce.number().int().positive(),
  subAssetClassId: z.coerce.number().int().positive(),
  managerId: z.coerce.number().int().positive(),
  legalEntityId: z.coerce.number().int().positive().nullable().optional(),
  additionalCode: z.string().regex(/^[A-Z0-9]{1,3}$/).nullable().optional(),
  longName: singleLine(50),
  shortName: singleLine(30),
  modelId: z.coerce.number().int().positive().nullable().optional(),
  classificationId: z.coerce.number().int().positive().nullable().optional(),
  strategyId: z.coerce.number().int().positive(),
  subStrategyId: z.coerce.number().int().positive(),
  benchmarkId: z.coerce.number().int().positive().nullable().optional(),
});

export type AccountInput = z.infer<typeof AccountInput>;

// ═════════════════════════════════════════════════════════════════════
// Validation orchestrator
// ═════════════════════════════════════════════════════════════════════

export interface ValidationIssue {
  path: string;
  message: string;
}

/**
 * Generic validation helper: runs a Zod schema and returns either
 * the parsed data or an array of user-friendly validation issues.
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown,
): { success: true; data: T } | { success: false; issues: ValidationIssue[] } {
  const result = schema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  };
}

// ═════════════════════════════════════════════════════════════════════
// Account primary_account_id generation & validation
// ═════════════════════════════════════════════════════════════════════

/**
 * Generate the primary_account_id from its component parts.
 * Pattern: {clientCode}*{assetClassCode}{subAssetClassCode}*{managerCode}
 *
 * Returns null if the asset/sub-asset combination is not found in
 * the allowed options.
 */
export function generatePrimaryAccountId(
  clientCode: string,
  assetClassCode: string,
  subAssetClassCode: string,
  managerCode: string,
): string | null {
  return `${clientCode}*${assetClassCode}${subAssetClassCode}*${managerCode}`;
}

/**
 * Verify that a primary_account_id matches the expected format
 * given its dimension codes. This implements the same logic as
 * the PostgreSQL trigger trg_validate_account_selection.
 */
export function validatePrimaryAccountId(
  primaryAccountId: string,
  clientCode: string,
  assetClassCode: string,
  subAssetClassCode: string,
  managerCode: string,
): boolean {
  const expected = generatePrimaryAccountId(
    clientCode,
    assetClassCode,
    subAssetClassCode,
    managerCode,
  );
  return expected !== null && primaryAccountId === expected;
}

/**
 * Lookup the asset_class_code and sub_asset_class_code for a given
 * asset class + sub-asset-class name pair.
 */
export function lookupAssetSubAssetCodes(
  assetClass: string,
  subAssetClass: string,
): { assetClassCode: string; subAssetClassCode: string } | null {
  const entry = ASSET_SUB_ASSET_OPTIONS.find(
    (x) => x.assetClass === assetClass && x.subAssetClass === subAssetClass,
  );
  return entry
    ? { assetClassCode: entry.assetClassCode, subAssetClassCode: entry.subAssetClassCode }
    : null;
}
