/**
 * Change-processor — integration point between BCM change-management
 * workflow and the live client_config configuration.
 *
 * The processor is the SINGLE entry point for applying a change to the
 * live configuration when a change request reaches the 'processed' state.
 * Direct mutations of client_config tables (portfolio_configuration and
 * related) are NOT supported by any other code path.
 *
 * Architecture:
 *   1. change_request created via /changes/new (legacy or normalized form)
 *   2. A row is inserted into client_config.change_portfolio_configuration
 *      (one or more, depending on the change type)
 *   3. Stakeholders review/approve the change
 *   4. Status transitions to 'processed'
 *   5. processChangeForProcessedStatus() is invoked (from updateChangeStatus)
 *   6. processChangeForProcessedStatus() calls applyChangePortfolioConfigurations()
 *      from lib/client-config-db.ts
 *   7. The legacy createPortfolioFromChangeAction() is invoked as a fallback
 *      for change types that have NOT yet been migrated to the 3NF schema
 *
 * Every code path that wants to mutate client_config MUST go through the
 * change-management flow. The processor itself is invoked from the
 * status transition handler in lib/db.ts, which guards it inside the
 * existing change_requests update transaction.
 *
 * ENFORCEMENT:
 *   A database trigger (trg_enforce_change_process_{insert,update,delete})
 *   on client_config.portfolio_configuration blocks ANY direct INSERT,
 *   UPDATE, or DELETE that does not set the session variable
 *   app.change_process_bypass = 'true'. This variable is set inside
 *   applyChangePortfolioConfigurations() — the ONLY code path that
 *   should ever mutate the live configuration table.
 *   See db/enforce_change_process.sql.
 */

import { sql } from "@/lib/db";
import { applyChangePortfolioConfigurations, applyChangePortfolioMetadataRequests, getChangePortfolioConfigurations, getChangePortfolioMetadataRequests } from "@/lib/client-config-db";
import { captureError } from "@/lib/sentry-helper";

export interface ProcessChangeResult {
  changeRequestId: string;
  changeType: string;
  /** Number of staged change_portfolio_configuration rows for this change. */
  stagedRows: number;
  /** True when the change was applied to the live config. */
  applied: boolean;
  /** Outcome per staged row when applied. */
  outcomes: Array<{
    actionType: string;
    primaryAccountId: string;
    result: string;
    error?: string;
  }>;
  /** True when the legacy flat-schema path was used. */
  usedLegacy: boolean;
  error?: string;
}

/**
 * Try to apply any staged change_portfolio_configuration rows for a
 * change request. If no rows are present, fall back to the legacy
 * flat-schema processor.
 *
 * Returns a summary suitable for logging and audit trails.
 */
export async function processChangeForProcessedStatus(
  changeRequestId: string,
  changeType: string,
): Promise<ProcessChangeResult> {
  if (!sql) {
    return {
      changeRequestId,
      changeType,
      stagedRows: 0,
      applied: false,
      outcomes: [],
      usedLegacy: false,
      error: "Database niet bereikbaar.",
    };
  }

  // 1. Inspect the staged change_portfolio_metadata_request table
  //    (portfolio / parent_account create/retire).
  const stagedMetadata = await getChangePortfolioMetadataRequests(changeRequestId);
  if (stagedMetadata.length > 0) {
    try {
      const result = await applyChangePortfolioMetadataRequests(changeRequestId);
      return {
        changeRequestId,
        changeType,
        stagedRows: stagedMetadata.length,
        applied: result.success,
        outcomes: result.applied,
        usedLegacy: false,
        error: result.error,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Onbekende fout";
      captureError(error, { endpoint: "processChangeForProcessedStatus", phase: "apply_metadata" });
      return {
        changeRequestId,
        changeType,
        stagedRows: stagedMetadata.length,
        applied: false,
        outcomes: [],
        usedLegacy: false,
        error: message,
      };
    }
  }

  // 2. Inspect the staged change_portfolio_configuration table.
  const staged = await getChangePortfolioConfigurations(changeRequestId);
  if (staged.length > 0) {
    try {
      const result = await applyChangePortfolioConfigurations(changeRequestId);
      return {
        changeRequestId,
        changeType,
        stagedRows: staged.length,
        applied: result.success,
        outcomes: result.applied,
        usedLegacy: false,
        error: result.error,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Onbekende fout";
      captureError(error, { endpoint: "processChangeForProcessedStatus", phase: "apply_3nf" });
      return {
        changeRequestId,
        changeType,
        stagedRows: staged.length,
        applied: false,
        outcomes: [],
        usedLegacy: false,
        error: message,
      };
    }
  }

  // 3. No staged rows — fall back to the legacy flat-schema processor.
  if (changeType === "portfolio_addition") {
    try {
      const { createPortfolioFromChangeAction } = await import("@/lib/db");
      const result = await createPortfolioFromChangeAction(changeRequestId);
      return {
        changeRequestId,
        changeType,
        stagedRows: 0,
        applied: result.success,
        outcomes: result.portfolioId
          ? [
              {
                actionType: "CREATE",
                primaryAccountId: result.portfolioId,
                result: result.success ? "applied" : "failed",
                error: result.error,
              },
            ]
          : [],
        usedLegacy: true,
        error: result.error,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Onbekende fout";
      captureError(error, { endpoint: "processChangeForProcessedStatus", phase: "apply_legacy" });
      return {
        changeRequestId,
        changeType,
        stagedRows: 0,
        applied: false,
        outcomes: [],
        usedLegacy: true,
        error: message,
      };
    }
  }

  // 4. Other change types use the IST-sync path.
  try {
    const { istSyncOnProcessed } = await import("@/lib/db");
    await istSyncOnProcessed(changeRequestId);
    return {
      changeRequestId,
      changeType,
      stagedRows: 0,
      applied: true,
      outcomes: [],
      usedLegacy: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende fout";
    captureError(error, { endpoint: "processChangeForProcessedStatus", phase: "ist_sync" });
    return {
      changeRequestId,
      changeType,
      stagedRows: 0,
      applied: false,
      outcomes: [],
      usedLegacy: true,
      error: message,
    };
  }
}
