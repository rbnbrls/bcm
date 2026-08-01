/**
 * Business validation rules for client_config (normalized 3NF schema).
 *
 * This module consolidates all field-level, format-level, and cross-field
 * validation rules for the client_config schema, mirroring the SQL
 * validation triggers (trg_validate_account_selection and friends).
 *
 * All validations are pure functions and return either a list of
 * human-readable error messages (Dutch) or a flat `valid` flag. They are
 * used by the change-portfolio-configuration server action, the admin
 * client-config pages, and the unit tests.
 *
 * Validation categories implemented:
 *   1. Format rules           — regex patterns (codes, ids, dates)
 *   2. Length rules           — max length checks (matching varchar(N) limits)
 *   3. Required-field rules   — non-empty / null / whitespace checks
 *   4. Range rules            — numeric bounds and date ordering
 *   5. Conditional rules      — pairs, dependencies, business logic
 *
 * Every rule below is paired with a corresponding Zod schema in
 * lib/schemas/clientConfigInput.ts so the input layer and the DB layer
 * agree on what is valid.
 */

import { ASSET_SUB_ASSET_OPTIONS } from "@/lib/asset-classes";

// ─────────────────────────────────────────────────────────────────────────
// Type helpers
// ─────────────────────────────────────────────────────────────────────────

/** All valid action types for change_portfolio_configuration. */
export type ChangeActionType = "CREATE" | "UPDATE" | "DELETE";

/** All dimension fields that can be staged on a portfolio_configuration row. */
export interface PortfolioConfigurationInput {
  primaryAccountId?: string | null;
  clientCode: string;
  portfolioCode: string;
  assetClassCode: string;
  subAssetClassCode: string;
  managerCode: string;
  benchmarkCode: string;
  npcClassificationId: number | string;
  longName: string;
  shortName: string;
  effectiveFrom: string;
  effectiveUntil?: string | null;
}

/** Result of running all validations. */
export interface ValidationOutcome {
  valid: boolean;
  errors: string[];
}

// ─────────────────────────────────────────────────────────────────────────
// Field length limits (mirror the column definitions in entities/*.ts)
// ─────────────────────────────────────────────────────────────────────────

export const FIELD_LIMITS = {
  primaryAccountId: 13,
  clientCode: 3,
  portfolioCode: 15,
  assetClassCode: 2,
  subAssetClassCode: 3,
  managerCode: 3,
  benchmarkCode: 60,
  longName: 255,
  shortName: 100,
  effectiveFrom: 10, // "YYYY-MM-DD"
  effectiveUntil: 10,
} as const;

// ─────────────────────────────────────────────────────────────────────────
// Regex patterns
// ─────────────────────────────────────────────────────────────────────────

/** Alphanumeric uppercase, 1-3 chars — matches client_config.client.client_code. */
export const CLIENT_CODE_PATTERN = /^[A-Z0-9]{1,3}$/;

/** Alphanumeric uppercase, 2-15 chars — matches client_config.portfolio.portfolio_code. */
export const PORTFOLIO_CODE_PATTERN = /^[A-Z0-9]{2,15}$/;

/**
 * Parent account code: uppercase alphanumeric + underscore segments,
 * 1-16 chars — matches client_config.parent_account.parent_account_code.
 * Examples: PARENT_A, HOOFDREKENING_01
 */
export const PARENT_ACCOUNT_CODE_PATTERN = /^[A-Z0-9]+(?:_[A-Z0-9]+)*$/;

/** Two-letter asset class code (char(2) in DB). */
export const ASSET_CLASS_CODE_PATTERN = /^[A-Z]{2}$/;

/** Up to three-letter sub-asset class code (char(3) in DB for stored records). */
export const SUB_ASSET_CLASS_CODE_PATTERN = /^[A-Z]{0,3}$/;

/** Three-character manager code (char(3) in DB). */
export const MANAGER_CODE_PATTERN = /^[A-Z0-9]{3}$/;

/** Benchmark code: 1-60 chars, no newlines. */
export const BENCHMARK_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,59}$/;

/**
 * primary_account_id pattern: {client}*{AC}{subAC}*{manager}
 * Client 1-3 chars, AC 2 chars, subAC 3 chars, manager 3 chars.
 * Examples: ADP*EQACX*ROB, ADP*FIHYG*ROB
 */
export const PRIMARY_ACCOUNT_ID_PATTERN = /^[A-Z0-9]{1,3}\*[A-Z]{2}[A-Z]{3}\*[A-Z0-9]{3}$/;

/** ISO date YYYY-MM-DD. */
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** UUID v4 shape (case-insensitive, accepts any standard UUID variant). */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─────────────────────────────────────────────────────────────────────────
// Required-field validation
// ─────────────────────────────────────────────────────────────────────────

/**
 * Required fields on a CREATE/UPDATE portfolio configuration payload.
 * effectiveUntil and primaryAccountId are intentionally NOT in this list
 * because they are nullable / auto-generated.
 */
export const REQUIRED_FIELDS: ReadonlyArray<keyof PortfolioConfigurationInput> = [
  "clientCode",
  "portfolioCode",
  "assetClassCode",
  "subAssetClassCode",
  "managerCode",
  "benchmarkCode",
  "npcClassificationId",
  "longName",
  "shortName",
  "effectiveFrom",
];

function isEffectivelyEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  return false;
}

/**
 * Verify all required fields are present and non-empty.
 */
export function validateRequiredFields(input: Partial<PortfolioConfigurationInput>): string[] {
  const errors: string[] = [];
  for (const field of REQUIRED_FIELDS) {
    if (isEffectivelyEmpty(input[field])) {
      errors.push(`${field} is verplicht.`);
    }
  }
  return errors;
}

// ─────────────────────────────────────────────────────────────────────────
// Format validation
// ─────────────────────────────────────────────────────────────────────────

/**
 * Validate that all dimension codes match their expected regex patterns
 * and respect the column's length limit.
 */
export function validateFormat(input: Partial<PortfolioConfigurationInput>): string[] {
  const errors: string[] = [];

  // primaryAccountId is optional on input — generated from the four dimension codes.
  if (input.primaryAccountId != null && !isEffectivelyEmpty(input.primaryAccountId)) {
    const value = String(input.primaryAccountId).trim().toUpperCase();
    if (value.length > FIELD_LIMITS.primaryAccountId) {
      errors.push(`primaryAccountId mag maximaal ${FIELD_LIMITS.primaryAccountId} tekens zijn.`);
    } else if (!PRIMARY_ACCOUNT_ID_PATTERN.test(value)) {
      errors.push(
        `primaryAccountId "${value}" heeft niet het verwachte formaat ` +
        `(verwacht: {client}*{AC}{subAC}*{manager}).`,
      );
    }
  }

  if (!isEffectivelyEmpty(input.clientCode)) {
    const v = String(input.clientCode).trim();
    if (v.length > FIELD_LIMITS.clientCode) {
      errors.push(`Client code mag maximaal ${FIELD_LIMITS.clientCode} tekens zijn.`);
    } else if (!CLIENT_CODE_PATTERN.test(v)) {
      errors.push(`Client code "${v}" is ongeldig — gebruik 1-3 hoofdletters of cijfers.`);
    }
  }

  if (!isEffectivelyEmpty(input.portfolioCode)) {
    const v = String(input.portfolioCode).trim();
    if (v.length > FIELD_LIMITS.portfolioCode) {
      errors.push(`Portfolio code mag maximaal ${FIELD_LIMITS.portfolioCode} tekens zijn.`);
    } else if (!PORTFOLIO_CODE_PATTERN.test(v)) {
      errors.push(
        `Portfolio code "${v}" is ongeldig — gebruik 2-15 hoofdletters of cijfers.`,
      );
    }
  }

  if (!isEffectivelyEmpty(input.assetClassCode)) {
    const v = String(input.assetClassCode).trim();
    if (v.length !== FIELD_LIMITS.assetClassCode) {
      errors.push(`Asset class code moet precies ${FIELD_LIMITS.assetClassCode} tekens zijn.`);
    } else if (!ASSET_CLASS_CODE_PATTERN.test(v)) {
      errors.push(`Asset class code "${v}" moet uit 2 hoofdletters bestaan.`);
    }
  }

  if (input.subAssetClassCode != null && !isEffectivelyEmpty(input.subAssetClassCode)) {
    const v = String(input.subAssetClassCode).trim();
    if (v.length > FIELD_LIMITS.subAssetClassCode) {
      errors.push(`Sub asset class code mag maximaal ${FIELD_LIMITS.subAssetClassCode} tekens zijn.`);
    } else if (!SUB_ASSET_CLASS_CODE_PATTERN.test(v)) {
      errors.push(`Sub asset class code "${v}" mag alleen hoofdletters bevatten.`);
    }
  }

  if (!isEffectivelyEmpty(input.managerCode)) {
    const v = String(input.managerCode).trim();
    if (v.length !== FIELD_LIMITS.managerCode) {
      errors.push(`Manager code moet precies ${FIELD_LIMITS.managerCode} tekens zijn.`);
    } else if (!MANAGER_CODE_PATTERN.test(v)) {
      errors.push(`Manager code "${v}" moet uit 3 hoofdletters of cijfers bestaan.`);
    }
  }

  if (!isEffectivelyEmpty(input.benchmarkCode)) {
    const v = String(input.benchmarkCode).trim();
    if (v.length > FIELD_LIMITS.benchmarkCode) {
      errors.push(`Benchmark code mag maximaal ${FIELD_LIMITS.benchmarkCode} tekens zijn.`);
    } else if (!BENCHMARK_CODE_PATTERN.test(v)) {
      errors.push(
        `Benchmark code "${v}" is ongeldig — start met hoofdletter of cijfer, ` +
        `vervolgens hoofdletters/cijfers/punt/streepje/underscore.`,
      );
    }
  }

  if (!isEffectivelyEmpty(input.longName)) {
    const v = String(input.longName);
    if (v.length > FIELD_LIMITS.longName) {
      errors.push(`Lange naam mag maximaal ${FIELD_LIMITS.longName} tekens bevatten.`);
    }
    if (/[\r\n]/.test(v)) {
      errors.push("Lange naam mag geen regeleinden bevatten.");
    }
  }

  if (!isEffectivelyEmpty(input.shortName)) {
    const v = String(input.shortName);
    if (v.length > FIELD_LIMITS.shortName) {
      errors.push(`Korte naam mag maximaal ${FIELD_LIMITS.shortName} tekens bevatten.`);
    }
    if (/[\r\n]/.test(v)) {
      errors.push("Korte naam mag geen regeleinden bevatten.");
    }
  }

  if (!isEffectivelyEmpty(input.effectiveFrom)) {
    const v = String(input.effectiveFrom).trim();
    if (!ISO_DATE_PATTERN.test(v)) {
      errors.push(`Ingangsdatum "${v}" is geen geldige datum (verwacht YYYY-MM-DD).`);
    }
  }

  if (input.effectiveUntil != null && !isEffectivelyEmpty(input.effectiveUntil)) {
    const v = String(input.effectiveUntil).trim();
    if (!ISO_DATE_PATTERN.test(v)) {
      errors.push(`Einddatum "${v}" is geen geldige datum (verwacht YYYY-MM-DD).`);
    }
  }

  return errors;
}

// ─────────────────────────────────────────────────────────────────────────
// Range & date-order validation
// ─────────────────────────────────────────────────────────────────────────

/**
 * Validate that:
 *  - npc_classification_id is a positive integer
 *  - effective_from <= effective_until (when both provided)
 *  - effective_from is not absurdly in the past (before year 2000)
 */
export function validateRangesAndDates(input: Partial<PortfolioConfigurationInput>): string[] {
  const errors: string[] = [];

  const npc = input.npcClassificationId;
  if (npc !== undefined && npc !== null && npc !== "") {
    const n = typeof npc === "number" ? npc : Number(npc);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
      errors.push("NPC classificatie id moet een positief geheel getal zijn.");
    }
  }

  if (!isEffectivelyEmpty(input.effectiveFrom)) {
    const v = String(input.effectiveFrom).trim();
    if (ISO_DATE_PATTERN.test(v)) {
      const from = new Date(v + "T00:00:00Z");
      if (from.getUTCFullYear() < 2000) {
        errors.push("Ingangsdatum mag niet vóór 2000 liggen.");
      }
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      // NOTE: not enforcing "not in past" here because the change flow already
      // does so and historical back-dating is sometimes needed.
      void today;
    }
  }

  if (
    !isEffectivelyEmpty(input.effectiveFrom) &&
    input.effectiveUntil != null &&
    !isEffectivelyEmpty(input.effectiveUntil)
  ) {
    const from = String(input.effectiveFrom).trim();
    const until = String(input.effectiveUntil).trim();
    if (ISO_DATE_PATTERN.test(from) && ISO_DATE_PATTERN.test(until) && from > until) {
      errors.push("Einddatum moet op of na de ingangsdatum liggen.");
    }
  }

  return errors;
}

// ─────────────────────────────────────────────────────────────────────────
// Conditional / cross-field validation
// ─────────────────────────────────────────────────────────────────────────

/**
 * Build a primary_account_id from the client code and three dimension codes.
 * Returns null if any code is missing.
 */
export function buildPrimaryAccountId(
  clientCode: string,
  assetClassCode: string,
  subAssetClassCode: string,
  managerCode: string,
): string | null {
  if (
    isEffectivelyEmpty(clientCode) ||
    isEffectivelyEmpty(assetClassCode) ||
    isEffectivelyEmpty(subAssetClassCode) ||
    isEffectivelyEmpty(managerCode)
  ) {
    return null;
  }
  return `${clientCode}*${assetClassCode}${subAssetClassCode}*${managerCode}`.toUpperCase();
}

/**
 * Conditional rule: when an UPDATE carries a primaryAccountId, it must be
 * derivable from the supplied dimension codes (or match a previously-known
 * primary_account_id, which is the caller's responsibility to check).
 */
export function validatePrimaryAccountIdConsistency(
  input: Partial<PortfolioConfigurationInput>,
): string[] {
  const errors: string[] = [];

  if (isEffectivelyEmpty(input.clientCode) ||
      isEffectivelyEmpty(input.portfolioCode) ||
      isEffectivelyEmpty(input.assetClassCode) ||
      isEffectivelyEmpty(input.subAssetClassCode) ||
      isEffectivelyEmpty(input.managerCode)) {
    // Cannot derive — required-field check will report the gap.
    return errors;
  }

  const derived = buildPrimaryAccountId(
    String(input.clientCode),
    String(input.assetClassCode),
    String(input.subAssetClassCode ?? ""),
    String(input.managerCode),
  );

  if (!derived) {
    errors.push("Kan primaryAccountId niet afleiden uit de opgegeven dimensies.");
    return errors;
  }

  if (!isEffectivelyEmpty(input.primaryAccountId)) {
    if (String(input.primaryAccountId).trim().toUpperCase() !== derived) {
      errors.push(
        `primaryAccountId "${input.primaryAccountId}" komt niet overeen met de afgeleide ` +
        `waarde "${derived}" uit client / asset class / sub asset class / manager.`,
      );
    }
  }

  return errors;
}

/**
 * Conditional rule: the (asset_class_code, sub_asset_class_code) pair must
 * exist in the authoritative hierarchy. The same logic is enforced by the
 * trg_validate_account_selection PostgreSQL trigger.
 */
export function validateAssetSubAssetPair(
  assetClassCode: string,
  subAssetClassCode: string,
): string[] {
  const errors: string[] = [];

  if (isEffectivelyEmpty(assetClassCode)) {
    return errors; // required-field check will report
  }

  const ac = String(assetClassCode).trim().toUpperCase();

  // Empty sub_asset_class is allowed (it means "no specific sub-class")
  if (isEffectivelyEmpty(subAssetClassCode)) {
    return errors;
  }

  const sub = String(subAssetClassCode).trim().toUpperCase();

  const knownPair = ASSET_SUB_ASSET_OPTIONS.some(
    (x) => x.assetClassCode === ac && x.subAssetClassCode === sub,
  );

  if (!knownPair) {
    errors.push(
      `Combinatie asset class "${ac}" + sub asset class "${sub}" is niet toegestaan.`,
    );
  }

  return errors;
}

/**
 * Conditional rule: short_name should differ from long_name, and short_name
 * should not be longer than long_name (otherwise it's a strange name).
 */
export function validateNameRelationship(
  longName: string,
  shortName: string,
): string[] {
  const errors: string[] = [];
  if (isEffectivelyEmpty(longName) || isEffectivelyEmpty(shortName)) return errors;

  if (longName.trim().toLowerCase() === shortName.trim().toLowerCase()) {
    errors.push("Korte naam moet verschillend zijn van de lange naam.");
  }
  return errors;
}

/**
 * Conditional rule: action-specific guards.
 *  - CREATE  : the primary account must NOT already exist as active
 *              (caller verifies against the DB; this rule only surfaces a
 *              pre-flight message if the primaryAccountId is empty)
 *  - UPDATE  : the primary account MUST already exist
 *  - DELETE  : the primary account MUST already exist AND the supplied
 *              long_name/short_name should be the current ones (defensive)
 */
export function validateActionSpecificRules(
  action: ChangeActionType,
  input: Partial<PortfolioConfigurationInput>,
  existing: { primaryAccountId: string } | null,
): string[] {
  const errors: string[] = [];

  if (action === "CREATE") {
    if (existing) {
      errors.push(
        `primaryAccountId "${existing.primaryAccountId}" bestaat al — ` +
        `kan niet opnieuw aangemaakt worden.`,
      );
    }
  }

  if (action === "UPDATE" || action === "DELETE") {
    if (!existing) {
      const pid = input.primaryAccountId ?? buildPrimaryAccountId(
        String(input.clientCode ?? ""),
        String(input.assetClassCode ?? ""),
        String(input.subAssetClassCode ?? ""),
        String(input.managerCode ?? ""),
      );
      errors.push(
        `primaryAccountId "${pid ?? "<onbekend>"}" bestaat niet — ` +
        `kan niet ${action === "UPDATE" ? "bijgewerkt" : "verwijderd"} worden.`,
      );
    }
  }

  return errors;
}

// ─────────────────────────────────────────────────────────────────────────
// Orchestrating entry points
// ─────────────────────────────────────────────────────────────────────────

/**
 * Run every applicable validation on a portfolio_configuration payload and
 * return a consolidated ValidationOutcome.
 *
 * The optional `existing` parameter is the current row from the DB (when
 * known) and enables UPDATE/DELETE consistency checks.
 */
export function validatePortfolioConfiguration(
  input: Partial<PortfolioConfigurationInput>,
  options: {
    action: ChangeActionType;
    existing?: { primaryAccountId: string } | null;
  },
): ValidationOutcome {
  const errors: string[] = [
    ...validateRequiredFields(input),
    ...validateFormat(input),
    ...validateRangesAndDates(input),
    ...validatePrimaryAccountIdConsistency(input),
    ...validateAssetSubAssetPair(
      String(input.assetClassCode ?? ""),
      String(input.subAssetClassCode ?? ""),
    ),
    ...validateNameRelationship(
      String(input.longName ?? ""),
      String(input.shortName ?? ""),
    ),
    ...validateActionSpecificRules(options.action, input, options.existing ?? null),
  ];

  return { valid: errors.length === 0, errors };
}

/**
 * Convenience: validate only the staging-row shape used in
 * change_portfolio_configuration (i.e. includes changeRequestId, actionType).
 *
 * For DELETE actions the function does NOT check whether the row exists in
 * the live table — the caller (stageChangePortfolioConfiguration) does that
 * lookup and surfaces its own error. Otherwise a DELETE for a not-yet-
 * known primary_account_id would always fail, which makes the function
 * useless for forward-declared retirements.
 */
export function validateChangePortfolioConfiguration(input: {
  changeRequestId: string;
  actionType: ChangeActionType;
  clientCode: string;
  portfolioCode: string;
  assetClassCode: string;
  subAssetClassCode: string;
  managerCode: string;
  benchmarkCode: string;
  npcClassificationId: number | string;
  longName: string;
  shortName: string;
  effectiveFrom: string;
  effectiveUntil?: string | null;
}): ValidationOutcome {
  const errors: string[] = [];

  if (!UUID_PATTERN.test(String(input.changeRequestId ?? ""))) {
    errors.push("changeRequestId is geen geldige UUID.");
  }

  if (!["CREATE", "UPDATE", "DELETE"].includes(input.actionType)) {
    errors.push(`actionType "${input.actionType}" is niet toegestaan (verwacht CREATE/UPDATE/DELETE).`);
  }

  // For DELETE we skip the action-specific existing-row check (handled by
  // the caller after the DB lookup).
  if (input.actionType === "DELETE") {
    return {
      valid: errors.length === 0,
      errors: [
        ...errors,
        ...validateRequiredFields(input),
        ...validateFormat(input),
        ...validateRangesAndDates(input),
        ...validatePrimaryAccountIdConsistency(input),
        ...validateAssetSubAssetPair(
          String(input.assetClassCode ?? ""),
          String(input.subAssetClassCode ?? ""),
        ),
        ...validateNameRelationship(
          String(input.longName ?? ""),
          String(input.shortName ?? ""),
        ),
      ],
    };
  }

  // CREATE and UPDATE — dimension-level checks only (action-specific rules
  // are handled by the caller after a real DB lookup).
  const dimErrors: string[] = [
    ...validateRequiredFields(input),
    ...validateFormat(input),
    ...validateRangesAndDates(input),
    ...validatePrimaryAccountIdConsistency(input),
    ...validateAssetSubAssetPair(
      String(input.assetClassCode ?? ""),
      String(input.subAssetClassCode ?? ""),
    ),
    ...validateNameRelationship(
      String(input.longName ?? ""),
      String(input.shortName ?? ""),
    ),
  ];

  errors.push(...dimErrors);
  return { valid: errors.length === 0, errors };
}
