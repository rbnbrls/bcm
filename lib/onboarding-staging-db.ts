/**
 * CRUD helpers for client_config.client_onboarding_staging.
 *
 * The staging table is the entry point for onboarding genuinely new pension
 * funds (client + initial portfolio metadata) through the change process.
 * Rows are inserted with status 'pending' and move to 'applied'/'failed' when
 * the customer_onboarding change request is processed (apply step).
 *
 * Conventions (mirroring lib/client-config-db.ts):
 *  - All queries use postgres.js tagged templates, so every value is bound as
 *    a parameter — no string interpolation, no SQL injection surface.
 *  - Read helpers fall back (null / []) when no database is available so the
 *    UI can render; write helpers throw "Database not available".
 *  - Idempotency is enforced by the database via
 *    uq_onboarding_client_status UNIQUE (client_code, status): a second
 *    pending row for the same client code raises a unique violation
 *    (SQLSTATE 23505) which saveClientOnboardingStaging translates into a
 *    typed DuplicateClientOnboardingError. No application-level pre-check is
 *    performed — the constraint is authoritative and race-free.
 */

import { sql } from "@/lib/db";
import { captureError } from "@/lib/sentry-helper";
import {
  ASSET_CLASS_CODE_PATTERN,
  BENCHMARK_CODE_PATTERN,
  buildPrimaryAccountId,
  CLIENT_CODE_PATTERN,
  ISO_DATE_PATTERN,
  MANAGER_CODE_PATTERN,
  PORTFOLIO_CODE_PATTERN,
  UUID_PATTERN,
} from "@/lib/validation-rules";

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export type OnboardingStagingStatus = "pending" | "applied" | "failed";

export const ONBOARDING_STAGING_STATUSES: readonly OnboardingStagingStatus[] = [
  "pending",
  "applied",
  "failed",
];

/** A fully mapped client_onboarding_staging row (camelCase). */
export interface OnboardingStagingRow {
  stagingId: number;
  changeRequestId: string;
  clientCode: string;
  clientName: string;
  portfolioCode: string;
  parentAccountCode: string | null;
  assetClassCode: string;
  subAssetClassCode: string;
  managerCode: string;
  benchmarkCode: string;
  npcClassificationId: number;
  longName: string;
  shortName: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  status: OnboardingStagingStatus;
  applyError: string | null;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
}

/** Input for inserting a new pending onboarding staging row. */
export interface SaveClientOnboardingStagingInput {
  changeRequestId: string;
  clientCode: string;
  clientName: string;
  portfolioCode: string;
  parentAccountCode?: string | null;
  assetClassCode: string;
  subAssetClassCode: string;
  managerCode: string;
  benchmarkCode: string;
  npcClassificationId: number;
  longName: string;
  shortName: string;
  effectiveFrom: string;
  effectiveUntil?: string | null;
}

/** Partial patch for updating an existing staging row (status + metadata). */
export interface UpdateClientOnboardingStagingPatch {
  clientCode?: string;
  clientName?: string;
  portfolioCode?: string;
  parentAccountCode?: string | null;
  assetClassCode?: string;
  subAssetClassCode?: string;
  managerCode?: string;
  benchmarkCode?: string;
  npcClassificationId?: number;
  longName?: string;
  shortName?: string;
  effectiveFrom?: string;
  effectiveUntil?: string | null;
  status?: OnboardingStagingStatus;
  applyError?: string | null;
  processedAt?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────

/**
 * Thrown when a save/update would violate the idempotency constraint
 * uq_onboarding_client_status UNIQUE (client_code, status) — i.e. a staging
 * row with the same client code and status already exists.
 */
export class DuplicateClientOnboardingError extends Error {
  readonly clientCode: string;
  readonly status: OnboardingStagingStatus;

  constructor(clientCode: string, status: OnboardingStagingStatus) {
    super(
      `An onboarding staging row with status "${status}" already exists for client code "${clientCode}".`,
    );
    this.name = "DuplicateClientOnboardingError";
    this.clientCode = clientCode;
    this.status = status;
  }
}

/** Thrown when a save/update input fails client-side validation. */
export class OnboardingStagingValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid onboarding staging input: ${issues.join("; ")}`);
    this.name = "OnboardingStagingValidationError";
    this.issues = issues;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Mapping
// ─────────────────────────────────────────────────────────────────────────

function mapDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().split("T")[0];
  if (typeof value === "string") return value.split("T")[0];
  return String(value);
}

function mapTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function mapStagingRow(row: Record<string, unknown>): OnboardingStagingRow {
  return {
    stagingId: Number(row.staging_id),
    changeRequestId: String(row.change_request_id),
    clientCode: String(row.client_code),
    clientName: String(row.client_name),
    portfolioCode: String(row.portfolio_code),
    parentAccountCode:
      row.parent_account_code != null ? String(row.parent_account_code) : null,
    assetClassCode: String(row.asset_class_code),
    subAssetClassCode: String(row.sub_asset_class_code),
    managerCode: String(row.manager_code),
    benchmarkCode: String(row.benchmark_code),
    npcClassificationId: Number(row.npc_classification_id),
    longName: String(row.long_name),
    shortName: String(row.short_name),
    effectiveFrom: mapDate(row.effective_from),
    effectiveUntil: row.effective_until != null ? mapDate(row.effective_until) : null,
    status: String(row.status) as OnboardingStagingStatus,
    applyError: row.apply_error != null ? String(row.apply_error) : null,
    createdAt: mapTimestamp(row.created_at),
    updatedAt: mapTimestamp(row.updated_at),
    processedAt: row.processed_at != null ? mapTimestamp(row.processed_at) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────

const PARENT_ACCOUNT_CODE_PATTERN = /^[A-Z0-9]+(?:_[A-Z0-9]+)*$/;
const NO_CRLF_PATTERN = /^[^\r\n]+$/;
// The staging table CHECK requires exactly three uppercase letters, stricter
// than the general portfolio rule (^[A-Z]{0,3}$) used by validation-rules.
const SUB_ASSET_CLASS_CODE_PATTERN = /^[A-Z]{3}$/;

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim().length === 0;
}

/**
 * Validate a full save payload against the column CHECK constraints of
 * client_onboarding_staging. Returns a list of human-readable issues (empty
 * when valid). The database constraints remain the authoritative backstop.
 */
export function validateStagingInput(
  input: SaveClientOnboardingStagingInput,
): string[] {
  const issues: string[] = [];

  if (!UUID_PATTERN.test(String(input.changeRequestId ?? ""))) {
    issues.push("changeRequestId is geen geldige UUID.");
  }
  if (!CLIENT_CODE_PATTERN.test(String(input.clientCode ?? ""))) {
    issues.push("clientCode moet uit 1-3 hoofdletters/cijfers bestaan (bijv. ADP).");
  }
  if (
    isBlank(input.clientName) ||
    input.clientName.length > 100 ||
    !NO_CRLF_PATTERN.test(String(input.clientName))
  ) {
    issues.push("clientName is verplicht (maximaal 100 tekens, geen regeleinden).");
  }
  if (!PORTFOLIO_CODE_PATTERN.test(String(input.portfolioCode ?? ""))) {
    issues.push("portfolioCode moet uit 2-15 hoofdletters/cijfers bestaan.");
  }
  if (
    input.parentAccountCode != null &&
    (input.parentAccountCode.length > 16 ||
      !PARENT_ACCOUNT_CODE_PATTERN.test(String(input.parentAccountCode)))
  ) {
    issues.push("parentAccountCode is ongeldig (bijv. ADP_MAIN).");
  }
  if (!ASSET_CLASS_CODE_PATTERN.test(String(input.assetClassCode ?? ""))) {
    issues.push("assetClassCode moet uit precies 2 hoofdletters bestaan (bijv. FI).");
  }
  if (!SUB_ASSET_CLASS_CODE_PATTERN.test(String(input.subAssetClassCode ?? ""))) {
    issues.push("subAssetClassCode moet uit precies 3 hoofdletters bestaan (bijv. HYG).");
  }
  if (!MANAGER_CODE_PATTERN.test(String(input.managerCode ?? ""))) {
    issues.push("managerCode moet uit precies 3 hoofdletters/cijfers bestaan (bijv. ROB).");
  }
  if (!BENCHMARK_CODE_PATTERN.test(String(input.benchmarkCode ?? ""))) {
    issues.push("benchmarkCode is verplicht (maximaal 60 tekens).");
  }
  if (
    typeof input.npcClassificationId !== "number" ||
    !Number.isInteger(input.npcClassificationId) ||
    input.npcClassificationId < 0
  ) {
    issues.push("npcClassificationId moet een positief geheel getal zijn.");
  }
  if (
    isBlank(input.longName) ||
    input.longName.length > 255 ||
    !NO_CRLF_PATTERN.test(String(input.longName))
  ) {
    issues.push("longName is verplicht (maximaal 255 tekens, geen regeleinden).");
  }
  if (
    isBlank(input.shortName) ||
    input.shortName.length > 100 ||
    !NO_CRLF_PATTERN.test(String(input.shortName))
  ) {
    issues.push("shortName is verplicht (maximaal 100 tekens, geen regeleinden).");
  }
  if (!ISO_DATE_PATTERN.test(String(input.effectiveFrom ?? ""))) {
    issues.push("effectiveFrom is verplicht en moet een ISO-datum zijn (YYYY-MM-DD).");
  }
  if (
    input.effectiveUntil != null &&
    !ISO_DATE_PATTERN.test(String(input.effectiveUntil))
  ) {
    issues.push("effectiveUntil moet een ISO-datum zijn (YYYY-MM-DD) of leeg.");
  }
  if (
    ISO_DATE_PATTERN.test(String(input.effectiveFrom ?? "")) &&
    input.effectiveUntil != null &&
    ISO_DATE_PATTERN.test(String(input.effectiveUntil)) &&
    String(input.effectiveUntil) < String(input.effectiveFrom)
  ) {
    issues.push("effectiveUntil mag niet vóór effectiveFrom liggen.");
  }

  return issues;
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/** Translate a postgres.js error into a typed error when it is a known case. */
function translateDbError(error: unknown, clientCode?: string): Error {
  const code = (error as { code?: string } | null)?.code;
  // postgres.js exposes the constraint via `constraint_name`; `constraint`
  // is accepted too for other drivers / mocks.
  const constraint =
    (error as { constraint_name?: string } | null)?.constraint_name ??
    (error as { constraint?: string } | null)?.constraint;
  if (code === "23505") {
    // uq_onboarding_client_status UNIQUE (client_code, status).
    if (constraint === "uq_onboarding_client_status") {
      return new DuplicateClientOnboardingError(
        clientCode ?? "onbekend",
        "pending",
      );
    }
  }
  return error instanceof Error ? error : new Error(String(error));
}

/** A save payload after normalization: optional fields are non-undefined. */
type NormalizedStagingInput = Omit<SaveClientOnboardingStagingInput, "parentAccountCode" | "effectiveUntil"> & {
  parentAccountCode: string | null;
  effectiveUntil: string | null;
};

/**
 * Normalize a save payload: codes are trimmed and uppercased (the database
 * CHECK constraints require uppercase), optional values collapse to null.
 * The normalized payload is what validation and the INSERT see.
 */
function normalizeStagingInput(
  input: SaveClientOnboardingStagingInput,
): NormalizedStagingInput {
  return {
    ...input,
    clientCode: input.clientCode.toUpperCase(),
    clientName: input.clientName,
    portfolioCode: input.portfolioCode.toUpperCase(),
    parentAccountCode:
      input.parentAccountCode != null ? input.parentAccountCode.toUpperCase() : null,
    assetClassCode: input.assetClassCode.toUpperCase(),
    subAssetClassCode: input.subAssetClassCode.toUpperCase(),
    managerCode: input.managerCode.toUpperCase(),
    benchmarkCode: input.benchmarkCode.toUpperCase(),
    effectiveUntil: input.effectiveUntil ?? null,
  };
}

/**
 * Save a new staging row with status 'pending'.
 *
 * Input is normalized first (codes uppercased), then validated against the
 * staging column contracts, then inserted.
 *
 * Throws:
 *  - OnboardingStagingValidationError when the input does not satisfy the
 *    staging column contracts.
 *  - DuplicateClientOnboardingError when a row with the same client code and
 *    status 'pending' already exists (unique violation 23505).
 *  - Error("Database not available") when no database connection is
 *    configured.
 */
export async function saveClientOnboardingStaging(
  input: SaveClientOnboardingStagingInput,
): Promise<OnboardingStagingRow> {
  const normalized = normalizeStagingInput(input);
  const issues = validateStagingInput(normalized);
  if (issues.length > 0) {
    throw new OnboardingStagingValidationError(issues);
  }
  if (!sql) throw new Error("Database not available");

  try {
    const rows = await sql!`
      INSERT INTO client_config.client_onboarding_staging (
        change_request_id,
        client_code,
        client_name,
        portfolio_code,
        parent_account_code,
        asset_class_code,
        sub_asset_class_code,
        manager_code,
        benchmark_code,
        npc_classification_id,
        long_name,
        short_name,
        effective_from,
        effective_until,
        status
      ) VALUES (
        ${normalized.changeRequestId},
        ${normalized.clientCode},
        ${normalized.clientName},
        ${normalized.portfolioCode},
        ${normalized.parentAccountCode},
        ${normalized.assetClassCode},
        ${normalized.subAssetClassCode},
        ${normalized.managerCode},
        ${normalized.benchmarkCode},
        ${normalized.npcClassificationId},
        ${normalized.longName},
        ${normalized.shortName},
        ${normalized.effectiveFrom},
        ${normalized.effectiveUntil},
        'pending'
      )
      RETURNING *
    `;
    return mapStagingRow(rows[0] as Record<string, unknown>);
  } catch (error) {
    throw translateDbError(error, normalized.clientCode);
  }
}

/**
 * Read a staging row by its primary key. Returns null when no row exists
 * (or when the database is unavailable).
 */
export async function getClientOnboardingStagingByStagingId(
  stagingId: number,
): Promise<OnboardingStagingRow | null> {
  if (!sql) return null;
  try {
    const rows = await sql!`
      SELECT *
      FROM client_config.client_onboarding_staging
      WHERE staging_id = ${stagingId}
      LIMIT 1
    `;
    if (rows.length === 0) return null;
    return mapStagingRow(rows[0] as Record<string, unknown>);
  } catch (error) {
    captureError(error, {
      endpoint: "onboarding-staging-db",
      phase: "get_by_staging_id",
    });
    return null;
  }
}

/**
 * Read staging rows by client code, newest first. Pass `status` to narrow the
 * result to a single lifecycle state (e.g. 'pending' for idempotency checks).
 * Returns an empty array when no rows exist (or when the database is
 * unavailable).
 */
export async function getClientOnboardingStagingByClientCode(
  clientCode: string,
  options: { status?: OnboardingStagingStatus } = {},
): Promise<OnboardingStagingRow[]> {
  if (!sql) return [];
  try {
    const rows = await sql!`
      SELECT *
      FROM client_config.client_onboarding_staging
      WHERE client_code = ${clientCode.toUpperCase()}
        ${options.status != null ? sql`AND status = ${options.status}` : sql``}
      ORDER BY staging_id DESC
    `;
    return (rows as Record<string, unknown>[]).map(mapStagingRow);
  } catch (error) {
    captureError(error, {
      endpoint: "onboarding-staging-db",
      phase: "get_by_client_code",
    });
    return [];
  }
}

/**
 * Read the staging row for a change request. The UNIQUE constraint on
 * change_request_id guarantees at most one row, so this returns a single row
 * or null. Used by the apply step (applyClientOnboardingStaging) and by
 * processChangeForProcessedStatus to detect whether a customer_onboarding
 * change has staged data.
 *
 * Returns null when no row exists (or when the database is unavailable).
 */
export async function getClientOnboardingStagingByChangeRequestId(
  changeRequestId: string,
): Promise<OnboardingStagingRow | null> {
  if (!sql) return null;
  try {
    const rows = await sql!`
      SELECT *
      FROM client_config.client_onboarding_staging
      WHERE change_request_id = ${changeRequestId}
      LIMIT 1
    `;
    if (rows.length === 0) return null;
    return mapStagingRow(rows[0] as Record<string, unknown>);
  } catch (error) {
    captureError(error, {
      endpoint: "onboarding-staging-db",
      phase: "get_by_change_request_id",
    });
    return null;
  }
}

/**
 * Update status and/or metadata on an existing staging row. Only the columns
 * present in `patch` are changed; `updated_at` is always bumped. Returns the
 * updated row, or null when no row with `stagingId` exists.
 *
 * COALESCE semantics (matching `updateChangePortfolioConfiguration`): nullable
 * columns can be set to a value but not cleared back to NULL via this helper —
 * the apply step sets `apply_error`/`processed_at` to concrete values.
 *
 * Throws:
 *  - OnboardingStagingValidationError when the status is not a valid value.
 *  - DuplicateClientOnboardingError when the patch would collide with the
 *    UNIQUE (client_code, status) idempotency constraint.
 *  - Error("Database not available") when no database connection is
 *    configured.
 */
export async function updateClientOnboardingStaging(
  stagingId: number,
  patch: UpdateClientOnboardingStagingPatch,
): Promise<OnboardingStagingRow | null> {
  if (patch.status != null && !ONBOARDING_STAGING_STATUSES.includes(patch.status)) {
    throw new OnboardingStagingValidationError([
      `status "${patch.status}" is niet toegestaan (verwacht pending/applied/failed).`,
    ]);
  }
  if (!sql) throw new Error("Database not available");

  try {
    const rows = await sql!`
      UPDATE client_config.client_onboarding_staging SET
        client_code           = COALESCE(${patch.clientCode?.toUpperCase() ?? null}, client_code),
        client_name           = COALESCE(${patch.clientName ?? null}, client_name),
        portfolio_code        = COALESCE(${patch.portfolioCode?.toUpperCase() ?? null}, portfolio_code),
        parent_account_code   = COALESCE(${patch.parentAccountCode != null ? patch.parentAccountCode.toUpperCase() : null}, parent_account_code),
        asset_class_code      = COALESCE(${patch.assetClassCode?.toUpperCase() ?? null}, asset_class_code),
        sub_asset_class_code  = COALESCE(${patch.subAssetClassCode?.toUpperCase() ?? null}, sub_asset_class_code),
        manager_code          = COALESCE(${patch.managerCode?.toUpperCase() ?? null}, manager_code),
        benchmark_code        = COALESCE(${patch.benchmarkCode?.toUpperCase() ?? null}, benchmark_code),
        npc_classification_id = COALESCE(${patch.npcClassificationId ?? null}, npc_classification_id),
        long_name             = COALESCE(${patch.longName ?? null}, long_name),
        short_name            = COALESCE(${patch.shortName ?? null}, short_name),
        effective_from        = COALESCE(${patch.effectiveFrom ?? null}, effective_from),
        effective_until       = COALESCE(${patch.effectiveUntil ?? null}, effective_until),
        status                = COALESCE(${patch.status ?? null}, status),
        apply_error           = COALESCE(${patch.applyError ?? null}, apply_error),
        processed_at          = COALESCE(${patch.processedAt ?? null}, processed_at),
        updated_at            = now()
      WHERE staging_id = ${stagingId}
      RETURNING *
    `;
    if (rows.length === 0) return null;
    return mapStagingRow(rows[0] as Record<string, unknown>);
  } catch (error) {
    throw translateDbError(error, patch.clientCode);
  }
}

/**
 * Delete a staging row by its primary key. Returns true when a row was
 * actually deleted, false when no row with `stagingId` exists.
 *
 * Throws Error("Database not available") when no database connection is
 * configured.
 */
export async function deleteClientOnboardingStaging(
  stagingId: number,
): Promise<boolean> {
  if (!sql) throw new Error("Database not available");
  const rows = await sql!`
    DELETE FROM client_config.client_onboarding_staging
    WHERE staging_id = ${stagingId}
    RETURNING staging_id
  `;
  return rows.length > 0;
}

// ─────────────────────────────────────────────────────────────────────────
// Apply step (invoked from processChangeForProcessedStatus)
// ─────────────────────────────────────────────────────────────────────────

/** One outcome line for the onboarding apply step. */
export interface OnboardingApplyOutcome {
  actionType: "CREATE" | "SKIP";
  primaryAccountId: string;
  result: "applied" | "skipped" | "failed";
  error?: string;
}

/** Result of applying a staged client onboarding to the live tables. */
export interface OnboardingApplyResult {
  success: boolean;
  applied: OnboardingApplyOutcome[];
  error?: string;
}

/**
 * Apply a staged client onboarding to the live client_config tables.
 *
 * Invoked from `processChangeForProcessedStatus` when a customer_onboarding
 * change request reaches status 'processed'. Everything runs in ONE database
 * transaction:
 *
 *   1. `SET LOCAL app.change_process_bypass = 'true'` — the governed-path GUC
 *      so the enforcement triggers on portfolio_configuration allow the
 *      inserts (same mechanism as the other apply functions).
 *   2. Idempotency check: when a `client_config.client` row already exists
 *      for the staged client code, the apply is SKIPPED and the staging row
 *      is flipped to 'applied' (re-processing an already applied change is
 *      safe; the DB backstop is `uq_onboarding_client_status`).
 *   3. Parent account is resolved by code (`active_ind = true`); when it does
 *      not exist yet it is created first.
 *   4. INSERT `client_config.client` (client_code, client_name).
 *   5. INSERT `client_config.portfolio` (portfolio_code, parent_account_id).
 *   6. INSERT the initial `client_config.portfolio_configuration` row with
 *      the derived primary_account_id (client*AC{subAC}*manager) and
 *      `change_request_id` lineage.
 *   7. UPDATE the staging row to status 'applied' (processed_at set).
 *
 * On ANY error the transaction is rolled back (postgres.js `begin` semantics)
 * — no partial live rows survive — and the staging row is flipped to status
 * 'failed' with `apply_error` + `processed_at` so the failure is visible and
 * a later re-process can retry the apply.
 *
 * Status handling on entry:
 *  - 'pending'  → apply (or skip when the client already exists).
 *  - 'failed'   → retry the apply (the previous transaction rolled back, so
 *                 no live rows were created).
 *  - 'applied'  → nothing to do; returns success with a "skipped" outcome.
 *
 * Returns:
 *  - { success: true, applied: [...] } on success (or idempotent skip).
 *  - { success: false, error } when the apply failed; the staging row is
 *    marked 'failed' with the error message.
 *  - { success: false, error: "Database not available" } when no database
 *    connection is configured.
 */
export async function applyClientOnboardingStaging(
  changeRequestId: string,
): Promise<OnboardingApplyResult> {
  if (!sql) {
    return { success: false, applied: [], error: "Database not available" };
  }

  const row = await getClientOnboardingStagingByChangeRequestId(changeRequestId);
  if (!row) {
    // Nothing staged for this change request — nothing to apply.
    return { success: true, applied: [] };
  }

  if (row.status === "applied") {
    // Re-processing an already applied change: safe skip, no writes.
    return {
      success: true,
      applied: [
        {
          actionType: "SKIP",
          primaryAccountId: row.clientCode,
          result: "skipped",
          error: "Onboarding is al toegepast voor deze change.",
        },
      ],
    };
  }

  const applied: OnboardingApplyOutcome[] = [];

  try {
    await (sql as any).begin(async (tx: any) => {
      // Governed-path GUC: allows the portfolio_configuration inserts despite
      // the change-process enforcement triggers (db/enforce_change_process.sql).
      await tx`SET LOCAL app.change_process_bypass = 'true'`;

      // 2. Idempotency: skip when the client row already exists.
      const [existingClient] = await tx`
        SELECT client_code
        FROM client_config.client
        WHERE client_code = ${row.clientCode}
        LIMIT 1
      `;
      if (existingClient) {
        await tx`
          UPDATE client_config.client_onboarding_staging
          SET status = 'applied',
              apply_error = NULL,
              processed_at = now(),
              updated_at = now()
          WHERE staging_id = ${row.stagingId}
        `;
        applied.push({
          actionType: "SKIP",
          primaryAccountId: row.clientCode,
          result: "skipped",
          error: `Client "${row.clientCode}" bestaat al in client_config.`,
        });
        return;
      }

      // 3. Parent account: reuse an existing active one, otherwise create it.
      let parentAccountId: number | null = null;
      if (row.parentAccountCode) {
        const [parentAccount] = await tx`
          SELECT parent_account_id
          FROM client_config.parent_account
          WHERE parent_account_code = ${row.parentAccountCode}
            AND active_ind = true
          LIMIT 1
        `;
        if (parentAccount) {
          parentAccountId = Number(parentAccount.parent_account_id);
        } else {
          const [createdParentAccount] = await tx`
            INSERT INTO client_config.parent_account (parent_account_code, active_ind)
            VALUES (${row.parentAccountCode}, true)
            RETURNING parent_account_id
          `;
          parentAccountId = Number(createdParentAccount.parent_account_id);
        }
      }

      // 4. New client row.
      await tx`
        INSERT INTO client_config.client (client_code, client_name)
        VALUES (${row.clientCode}, ${row.clientName})
      `;

      // 5. Portfolio metadata for the initial portfolio.
      await tx`
        INSERT INTO client_config.portfolio (portfolio_code, parent_account_id, active_ind)
        VALUES (${row.portfolioCode}, ${parentAccountId}, true)
      `;

      // 6. Initial portfolio_configuration row (live-table FKs validate the
      //    staged dimension values here — staging deliberately has no FKs).
      const primaryAccountId = buildPrimaryAccountId(
        row.clientCode,
        row.assetClassCode,
        row.subAssetClassCode,
        row.managerCode,
      );
      if (!primaryAccountId) {
        throw new Error("Kan primaryAccountId niet afleiden uit de dimensies.");
      }
      await tx`
        INSERT INTO client_config.portfolio_configuration (
          primary_account_id,
          client_code,
          portfolio_code,
          asset_class_code,
          sub_asset_class_code,
          manager_code,
          benchmark_code,
          npc_classification_id,
          long_name,
          short_name,
          active_ind,
          effective_from,
          effective_until,
          change_request_id
        ) VALUES (
          ${primaryAccountId},
          ${row.clientCode},
          ${row.portfolioCode},
          ${row.assetClassCode},
          ${row.subAssetClassCode},
          ${row.managerCode},
          ${row.benchmarkCode},
          ${row.npcClassificationId},
          ${row.longName},
          ${row.shortName},
          true,
          ${row.effectiveFrom},
          ${row.effectiveUntil},
          ${changeRequestId}
        )
      `;

      // 7. Staging row → applied.
      await tx`
        UPDATE client_config.client_onboarding_staging
        SET status = 'applied',
            apply_error = NULL,
            processed_at = now(),
            updated_at = now()
        WHERE staging_id = ${row.stagingId}
      `;

      applied.push({
        actionType: "CREATE",
        primaryAccountId,
        result: "applied",
      });
    });

    return { success: true, applied };
  } catch (error) {
    // The transaction was rolled back — no partial live rows remain. Record
    // the failure on the staging row so it is visible and retryable.
    const message = error instanceof Error ? error.message : "Onbekende fout";
    captureError(error, {
      endpoint: "onboarding-staging-db",
      phase: "apply",
    });
    try {
      await sql!`
        UPDATE client_config.client_onboarding_staging
        SET status = 'failed',
            apply_error = ${message},
            processed_at = now(),
            updated_at = now()
        WHERE staging_id = ${row.stagingId}
      `;
    } catch (markFailedError) {
      captureError(markFailedError, {
        endpoint: "onboarding-staging-db",
        phase: "apply_mark_failed",
      });
    }
    return { success: false, applied, error: message };
  }
}
