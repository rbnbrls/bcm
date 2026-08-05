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
 *   6. processChangeForProcessedStatus() resolves the change-type registry
 *      and dispatches to applyStrategies[registration.applyStrategy]
 *   7. Each strategy owns its staging lookup, apply step and legacy fallback
 *      for that change type
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
 *   applyChangePortfolioConfigurations() via the staged_portfolio_configuration
 *   strategy — the ONLY code path that should ever mutate the live
 *   portfolio_configuration table.
 *   See db/enforce_change_process.sql.
 */

import { sql } from "@/lib/db";
import { getApplyStrategy } from "@/lib/apply-strategies";
import { resolveChangeTypeRegistration } from "@/lib/change-type-registry";
import type { ProcessChangeResult } from "@/lib/change-processing-types";

export type { ProcessChangeResult } from "@/lib/change-processing-types";

/**
 * Apply a processed change through its registered apply strategy.
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

  const registration = resolveChangeTypeRegistration(changeType);
  const strategy = getApplyStrategy(registration.applyStrategy);
  return strategy({ changeRequestId, changeType, registration });
}
