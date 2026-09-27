/**
 * Shared validation for `client_config.portfolio` and `client_config.parent_account`
 * metadata changes (CREATE / RETIRE through the governed change-request flow).
 *
 * ## Why this module exists
 *
 * The lifecycle spec (`documentation/portfolio-parent-account-lifecycle-spec.md` §6.2, §7)
 * requires one source of truth for:
 *   1. format rules          — code patterns / length limits per dimension
 *   2. uniqueness (CREATE)   — no duplicate portfolio_code / parent_account_code,
 *                              active OR retired rows (codes are global identity)
 *   3. foreign-key safety    — a portfolio CREATE may only reference an ACTIVE
 *                              parent account; a RETIRE must not orphan children
 *   4. duplicate staging     — same dimension + code in another open change request
 *
 * This module is deliberately **framework- and DB-agnostic**:
 *   - it imports nothing from the server layer (no `postgres`, no `@/lib/db`),
 *     so it can be imported from server actions AND client components/forms;
 *   - DB-backed facts arrive through the `PortfolioMetadataLookup` interface
 *     (dependency injection): the backend passes a SQL-backed lookup, a frontend
 *     form can pass an API-backed lookup — the rules never change.
 *
 * All error messages are Dutch and match the spec §7 exactly.
 */

import {
  PARENT_ACCOUNT_CODE_PATTERN,
  PORTFOLIO_CODE_PATTERN,
} from "@/lib/validation-rules";

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export type PortfolioMetadataDimension = "portfolio" | "parent_account";
export type PortfolioMetadataActionType = "CREATE" | "RETIRE";

export interface PortfolioMetadataChangeInput {
  changeRequestId: string;
  dimension: PortfolioMetadataDimension;
  actionType: PortfolioMetadataActionType;
  code: string;
  /** Portfolio only: human-readable parent-account code resolved at apply time. */
  parentAccountCode?: string | null;
  /** Parent-account only: optional MSA code. */
  msaParentAccountCode?: string | null;
}

/**
 * DB-backed predicates used by `validatePortfolioMetadataChange`.
 *
 * The backend implementation lives in `lib/client-config-db.ts`
 * (`createPortfolioMetadataLookup`); frontends can supply an API-backed
 * implementation so the same validation rules run client-side.
 */
export interface PortfolioMetadataLookup {
  /** True when the code exists in an active OR retired row of the target table. */
  codeExists(dimension: PortfolioMetadataDimension, code: string): Promise<boolean>;
  /** True when a parent account with this code exists and is active. */
  parentAccountActive(code: string): Promise<boolean>;
  /** True when any ACTIVE portfolio_configuration rows reference this portfolio code. */
  portfolioHasActiveConfigurations(code: string): Promise<boolean>;
  /** True when any ACTIVE portfolio references this parent account. */
  parentAccountHasActivePortfolios(code: string): Promise<boolean>;
  /** True when the same dimension + code is staged in another OPEN change request. */
  alreadyStagedInOpenChange(
    dimension: PortfolioMetadataDimension,
    code: string,
    changeRequestId: string,
  ): Promise<boolean>;
}

// ─────────────────────────────────────────────────────────────────────────
// Format validation (pure, no DB)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Validate code format for the given dimension.
 * Returns a Dutch error message when the format is invalid, or null when valid.
 */
export function validateCodeFormat(
  code: string,
  dimension: PortfolioMetadataDimension,
): string | null {
  const trimmed = code.trim().toUpperCase();
  if (dimension === "portfolio") {
    if (trimmed.length < 2 || trimmed.length > 15) {
      return `Code "${code}" moet 2-15 tekens zijn.`;
    }
    if (!PORTFOLIO_CODE_PATTERN.test(trimmed)) {
      return `Portfolio code "${code}" voldoet niet aan het verwachte formaat (hoofdletters of cijfers, 2-15 tekens).`;
    }
  } else {
    if (trimmed.length < 1 || trimmed.length > 16) {
      return `Code "${code}" moet 1-16 tekens zijn.`;
    }
    if (!PARENT_ACCOUNT_CODE_PATTERN.test(trimmed)) {
      return `Parent account code "${code}" voldoet niet aan het verwachte formaat (hoofdletters, cijfers en underscores).`;
    }
  }
  return null;
}

/**
 * Validate the optional `parentAccountCode` (portfolio CREATE) and
 * `msaParentAccountCode` (parent_account CREATE) values. Non-empty values are
 * length- and pattern-checked; empty/null values are allowed.
 */
export function validateOptionalMetadataCodes(input: PortfolioMetadataChangeInput): string[] {
  const issues: string[] = [];

  if (
    input.dimension === "portfolio" &&
    input.actionType === "CREATE" &&
    input.parentAccountCode != null &&
    input.parentAccountCode.trim().length > 0
  ) {
    const paCode = input.parentAccountCode.trim().toUpperCase();
    if (paCode.length > 16 || !PARENT_ACCOUNT_CODE_PATTERN.test(paCode)) {
      issues.push(`Ouderaccount code "${input.parentAccountCode}" voldoet niet aan het verwachte formaat.`);
    }
  }

  if (
    input.dimension === "parent_account" &&
    input.actionType === "CREATE" &&
    input.msaParentAccountCode != null &&
    input.msaParentAccountCode.trim().length > 0
  ) {
    const msaCode = input.msaParentAccountCode.trim().toUpperCase();
    if (msaCode.length > 16 || !PARENT_ACCOUNT_CODE_PATTERN.test(msaCode)) {
      issues.push(`MSA parent account code "${input.msaParentAccountCode}" voldoet niet aan het verwachte formaat.`);
    }
  }

  return issues;
}

/**
 * Format-only validation (no DB). Returns Dutch error messages for format /
 * length problems on the main code and any optional codes. Empty result means
 * the input is well-formed; uniqueness and FK checks still need
 * `validatePortfolioMetadataChange`.
 */
export function validatePortfolioMetadataFormat(input: PortfolioMetadataChangeInput): string[] {
  const issues: string[] = [];
  const formatError = validateCodeFormat(input.code, input.dimension);
  if (formatError) issues.push(formatError);
  issues.push(...validateOptionalMetadataCodes(input));
  return issues;
}

// ─────────────────────────────────────────────────────────────────────────
// Full validation pipeline (format + uniqueness + FK safety + staging)
// ─────────────────────────────────────────────────────────────────────────
//
// Mirrors the stage-time rules in the lifecycle spec §6.2, in the same order:
//   1. format issues are collected together and short-circuit on the first block
//   2. uniqueness (CREATE only)
//   3. parent account exists + active (portfolio CREATE with parentAccountCode)
//   4. retire pre-conditions (no active children)
//   5. duplicate-staging in another open change request

/**
 * Run the complete validation pipeline for a portfolio / parent-account
 * metadata change. Returns Dutch error messages; an empty array means the
 * change may be staged.
 *
 * Callable from:
 *  - backend helpers: pass a SQL-backed lookup (`createPortfolioMetadataLookup`
 *    in lib/client-config-db.ts) — this is what `stagePortfolioMetadataChange` does;
 *  - frontend forms: pass an API-backed lookup (or run `validatePortfolioMetadataFormat`
 *    directly for pure client-side format feedback).
 */
export async function validatePortfolioMetadataChange(
  input: PortfolioMetadataChangeInput,
  lookup: PortfolioMetadataLookup,
): Promise<string[]> {
  const issues = validatePortfolioMetadataFormat(input);
  if (issues.length > 0) return issues;

  const code = input.code.trim().toUpperCase();

  // 2. Uniqueness for CREATE (active OR retired rows — codes are global identity).
  if (input.actionType === "CREATE") {
    if (await lookup.codeExists(input.dimension, code)) {
      issues.push(
        input.dimension === "portfolio"
          ? `Portfolio code "${code}" bestaat al.`
          : `Parent account code "${code}" bestaat al.`,
      );
      return issues;
    }
  }

  // 3. Portfolio CREATE with parentAccountCode: the referenced parent account
  //    must exist and be active (orphan prevention).
  if (
    input.dimension === "portfolio" &&
    input.actionType === "CREATE" &&
    input.parentAccountCode != null &&
    input.parentAccountCode.trim().length > 0 &&
    issues.length === 0
  ) {
    const paCode = input.parentAccountCode.trim().toUpperCase();
    if (!(await lookup.parentAccountActive(paCode))) {
      issues.push(`Ouderaccount "${paCode}" bestaat niet of is niet actief.`);
      return issues;
    }
  }

  // 4. Retire pre-conditions (§5.1): no active children may reference the row.
  //    Portfolio configuration is the source of truth for account mandates.
  if (input.actionType === "RETIRE" && issues.length === 0) {
    if (input.dimension === "portfolio") {
      if (await lookup.portfolioHasActiveConfigurations(code)) {
        issues.push(
          `Portfolio "${code}" heeft nog actieve portfolio configuraties. Verwijder of archiveer deze eerst.`,
        );
      }
    } else if (await lookup.parentAccountHasActivePortfolios(code)) {
      issues.push(`Parent account "${code}" heeft nog actieve portfolios. Archiveer deze eerst.`);
    }
    if (issues.length > 0) return issues;
  }

  // 5. Duplicate staging: same dimension + code in another open change request.
  if (issues.length === 0) {
    if (await lookup.alreadyStagedInOpenChange(input.dimension, code, input.changeRequestId)) {
      const label = input.dimension === "portfolio" ? "Portfolio code" : "Parent account code";
      issues.push(`${label} "${code}" is al eerder aangevraagd in een open change.`);
      return issues;
    }
  }

  return issues;
}
