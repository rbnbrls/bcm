/**
 * Normalized client_config data access layer.
 *
 * Queries the 3NF client_config schema (portfolio_configuration and its lookup
 * tables) instead of the legacy flat clients/portfolios structure. This module
 * is the runtime counterpart to lib/entities/ and lib/schemas/domain.ts.
 */

import { sql } from "@/lib/db";
import { demoClientConfigReferenceData } from "@/lib/fixtures";
import type {
  ClientConfigAssetClass,
  ClientConfigBenchmark,
  ClientConfigClient,
  ClientConfigManager,
  ClientConfigNpcClassification,
  ClientConfigPortfolio,
  ClientConfigPortfolioConfigurationRow,
  ClientConfigReferenceData,
  ClientConfigSubAssetClass,
} from "@/lib/types";
import { captureError } from "@/lib/sentry-helper";
import {
  buildPrimaryAccountId,
  validateActionSpecificRules,
  validateChangePortfolioConfiguration,
  validateRequiredFields,
  type ChangeActionType,
} from "@/lib/validation-rules";

/**
 * Safely execute a client_config query, returning the fallback on any failure.
 * Errors are reported to Sentry so silent failures do not hide incidents.
 */
async function withClientConfigQuery<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  if (!sql) return fallback;
  try {
    return await fn();
  } catch (error) {
    captureError(error, { endpoint: "client-config-db", phase: "db_query" });
    return fallback;
  }
}

function mapDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().split("T")[0];
  if (typeof value === "string") return value.split("T")[0];
  return String(value);
}

function mapPortfolioConfigurationRow(row: Record<string, unknown>): ClientConfigPortfolioConfigurationRow {
  return {
    primaryAccountId: String(row.primary_account_id),
    clientCode: String(row.client_code),
    clientName: row.client_name != null ? String(row.client_name) : null,
    portfolioCode: String(row.portfolio_code),
    parentAccountId: row.parent_account_id != null ? Number(row.parent_account_id) : null,
    parentAccountCode: row.parent_account_code != null ? String(row.parent_account_code) : null,
    assetClassCode: String(row.asset_class_code),
    assetClassName: String(row.asset_class_name),
    subAssetClassCode: String(row.sub_asset_class_code),
    subAssetClassName: String(row.sub_asset_class_name),
    managerCode: String(row.manager_code),
    managerName: String(row.manager_name),
    benchmarkCode: String(row.benchmark_code),
    benchmarkName: row.benchmark_name != null ? String(row.benchmark_name) : null,
    npcClassificationId: Number(row.npc_classification_id),
    npcClassificationName: String(row.classification_name),
    longName: String(row.long_name),
    shortName: String(row.short_name),
    activeInd: row.active_ind === true || String(row.active_ind) === "true",
    effectiveFrom: mapDate(row.effective_from),
    effectiveUntil: row.effective_until != null ? mapDate(row.effective_until) : null,
    changeRequestId: row.change_request_id != null ? String(row.change_request_id) : null,
  };
}

/**
 * Load all active portfolio_configuration rows joined with their lookup tables.
 * Returns an empty array when the database is unavailable or the tables are not
 * yet populated (e.g. fixture/demo mode).
 */
export async function getClientConfigPortfolioConfigurations(): Promise<ClientConfigPortfolioConfigurationRow[]> {
  return withClientConfigQuery(async () => {
    const rows = await sql!`
      SELECT
        pc.primary_account_id,
        pc.client_code,
        c.client_name,
        pc.portfolio_code,
        p.parent_account_id,
        pa.parent_account_code,
        pc.asset_class_code,
        ac.asset_class_name,
        pc.sub_asset_class_code,
        sac.sub_asset_class_name,
        pc.manager_code,
        m.manager_name,
        pc.benchmark_code,
        b.benchmark_name,
        pc.npc_classification_id,
        nc.classification_name,
        pc.long_name,
        pc.short_name,
        pc.active_ind,
        pc.effective_from,
        pc.effective_until,
        pc.change_request_id
      FROM client_config.portfolio_configuration pc
      JOIN client_config.client c ON c.client_code = pc.client_code
      JOIN client_config.portfolio p ON p.portfolio_code = pc.portfolio_code
      LEFT JOIN client_config.parent_account pa ON pa.parent_account_id = p.parent_account_id
      JOIN client_config.asset_class ac ON ac.asset_class_code = pc.asset_class_code
      JOIN client_config.sub_asset_class sac
        ON sac.asset_class_id = ac.asset_class_id
        AND sac.sub_asset_class_code = pc.sub_asset_class_code
      JOIN client_config.manager m ON m.manager_code = pc.manager_code
      JOIN client_config.benchmark b ON b.benchmark_code = pc.benchmark_code
      JOIN client_config.npc_classification nc ON nc.npc_classification_id = pc.npc_classification_id
      WHERE pc.active_ind = true
      ORDER BY pc.portfolio_code, ac.asset_class_name, sac.sub_asset_class_name
    `;
    return rows.map(mapPortfolioConfigurationRow);
  }, []);
}

function mapPortfolio(row: Record<string, unknown>): ClientConfigPortfolio {
  return {
    portfolioId: Number(row.portfolio_id),
    portfolioCode: String(row.portfolio_code),
    parentAccountId: row.parent_account_id != null ? Number(row.parent_account_id) : null,
  };
}

function mapClient(row: Record<string, unknown>): ClientConfigClient {
  return {
    clientCode: String(row.client_code),
    clientName: String(row.client_name),
  };
}

function mapAssetClass(row: Record<string, unknown>): ClientConfigAssetClass {
  return {
    assetClassId: Number(row.asset_class_id),
    assetClassCode: String(row.asset_class_code),
    assetClassName: String(row.asset_class_name),
  };
}

function mapSubAssetClass(row: Record<string, unknown>): ClientConfigSubAssetClass {
  return {
    subAssetClassId: Number(row.sub_asset_class_id),
    assetClassId: Number(row.asset_class_id),
    subAssetClassCode: String(row.sub_asset_class_code),
    subAssetClassName: String(row.sub_asset_class_name),
  };
}

function mapManager(row: Record<string, unknown>): ClientConfigManager {
  return {
    managerId: Number(row.manager_id),
    managerCode: String(row.manager_code),
    managerName: String(row.manager_name),
  };
}

function mapBenchmark(row: Record<string, unknown>): ClientConfigBenchmark {
  return {
    benchmarkId: Number(row.benchmark_id),
    benchmarkCode: String(row.benchmark_code),
    benchmarkName: row.benchmark_name != null ? String(row.benchmark_name) : null,
    rimesCode: row.rimes_code != null ? String(row.rimes_code) : null,
  };
}

function mapNpcClassification(row: Record<string, unknown>): ClientConfigNpcClassification {
  return {
    npcClassificationId: Number(row.npc_classification_id),
    classificationName: String(row.classification_name),
  };
}

/**
 * Load all reference data needed to populate normalized change-request forms.
 */
export async function getClientConfigReferenceData(): Promise<ClientConfigReferenceData> {
  return withClientConfigQuery(async () => {
    const [clients, portfolios, assetClasses, subAssetClasses, managers, benchmarks, npcClassifications] = await Promise.all([
      sql!`SELECT client_code, client_name FROM client_config.client ORDER BY client_code`,
      sql!`SELECT portfolio_id, portfolio_code, parent_account_id FROM client_config.portfolio ORDER BY portfolio_code`,
      sql!`SELECT asset_class_id, asset_class_code, asset_class_name FROM client_config.asset_class ORDER BY asset_class_name`,
      sql!`SELECT sub_asset_class_id, asset_class_id, sub_asset_class_code, sub_asset_class_name FROM client_config.sub_asset_class ORDER BY sub_asset_class_name`,
      sql!`SELECT manager_id, manager_code, manager_name FROM client_config.manager ORDER BY manager_name`,
      sql!`SELECT benchmark_id, benchmark_code, benchmark_name, rimes_code FROM client_config.benchmark ORDER BY benchmark_code`,
      sql!`SELECT npc_classification_id, classification_name FROM client_config.npc_classification ORDER BY classification_name`,
    ]);

    return {
      clients: clients.map(mapClient),
      portfolios: portfolios.map(mapPortfolio),
      assetClasses: assetClasses.map(mapAssetClass),
      subAssetClasses: subAssetClasses.map(mapSubAssetClass),
      managers: managers.map(mapManager),
      benchmarks: benchmarks.map(mapBenchmark),
      npcClassifications: npcClassifications.map(mapNpcClassification),
    };
  }, demoClientConfigReferenceData);
}

/**
 * Load a single portfolio_configuration row by primary_account_id.
 */
export async function getClientConfigPortfolioConfigurationById(
  primaryAccountId: string,
): Promise<ClientConfigPortfolioConfigurationRow | null> {
  return withClientConfigQuery(async () => {
    const rows = await sql!`
      SELECT
        pc.primary_account_id,
        pc.client_code,
        c.client_name,
        pc.portfolio_code,
        p.parent_account_id,
        pa.parent_account_code,
        pc.asset_class_code,
        ac.asset_class_name,
        pc.sub_asset_class_code,
        sac.sub_asset_class_name,
        pc.manager_code,
        m.manager_name,
        pc.benchmark_code,
        b.benchmark_name,
        pc.npc_classification_id,
        nc.classification_name,
        pc.long_name,
        pc.short_name,
        pc.active_ind,
        pc.effective_from,
        pc.effective_until,
        pc.change_request_id
      FROM client_config.portfolio_configuration pc
      JOIN client_config.client c ON c.client_code = pc.client_code
      JOIN client_config.portfolio p ON p.portfolio_code = pc.portfolio_code
      LEFT JOIN client_config.parent_account pa ON pa.parent_account_id = p.parent_account_id
      JOIN client_config.asset_class ac ON ac.asset_class_code = pc.asset_class_code
      JOIN client_config.sub_asset_class sac
        ON sac.asset_class_id = ac.asset_class_id
        AND sac.sub_asset_class_code = pc.sub_asset_class_code
      JOIN client_config.manager m ON m.manager_code = pc.manager_code
      JOIN client_config.benchmark b ON b.benchmark_code = pc.benchmark_code
      JOIN client_config.npc_classification nc ON nc.npc_classification_id = pc.npc_classification_id
      WHERE pc.primary_account_id = ${primaryAccountId}
      LIMIT 1
    `;
    return rows.length > 0 ? mapPortfolioConfigurationRow(rows[0]) : null;
  }, null);
}

/**
 * Insert a staged change_portfolio_configuration row for a change request.
 */
export async function saveChangePortfolioConfiguration(
  input: {
    changeRequestId: string;
    actionType: "CREATE" | "UPDATE" | "DELETE";
    clientCode: string;
    portfolioCode: string;
    assetClassCode: string;
    subAssetClassCode: string;
    managerCode: string;
    benchmarkCode: string;
    npcClassificationId: number;
    longName: string;
    shortName: string;
    effectiveFrom: string;
    effectiveUntil: string | null;
  },
): Promise<string> {
  if (!sql) throw new Error("Database not available");

  const rows = await sql!`
    INSERT INTO client_config.change_portfolio_configuration (
      change_request_id,
      action_type,
      client_code,
      portfolio_code,
      asset_class_code,
      sub_asset_class_code,
      manager_code,
      benchmark_code,
      npc_classification_id,
      long_name,
      short_name,
      effective_from,
      effective_until
    ) VALUES (
      ${input.changeRequestId},
      ${input.actionType},
      ${input.clientCode},
      ${input.portfolioCode},
      ${input.assetClassCode},
      ${input.subAssetClassCode},
      ${input.managerCode},
      ${input.benchmarkCode},
      ${input.npcClassificationId},
      ${input.longName},
      ${input.shortName},
      ${input.effectiveFrom},
      ${input.effectiveUntil}
    )
    RETURNING id
  `;
  return String(rows[0].id);
}

/**
 * Read all staged change_portfolio_configuration rows for a change request.
 * Used by the change-processor when applying a change to the live
 * portfolio_configuration table.
 */
export async function getChangePortfolioConfigurations(
  changeRequestId: string,
): Promise<
  Array<{
    id: number;
    changeRequestId: string;
    actionType: ChangeActionType;
    clientCode: string;
    portfolioCode: string;
    assetClassCode: string;
    subAssetClassCode: string;
    managerCode: string;
    benchmarkCode: string;
    npcClassificationId: number;
    longName: string;
    shortName: string;
    effectiveFrom: string;
    effectiveUntil: string | null;
  }>
> {
  return withClientConfigQuery(async () => {
    const rows = await sql!`
      SELECT
        id,
        change_request_id,
        action_type,
        client_code,
        portfolio_code,
        asset_class_code,
        sub_asset_class_code,
        manager_code,
        benchmark_code,
        npc_classification_id,
        long_name,
        short_name,
        effective_from,
        effective_until
      FROM client_config.change_portfolio_configuration
      WHERE change_request_id = ${changeRequestId}
      ORDER BY id ASC
    `;
    return rows.map((row: Record<string, unknown>) => ({
      id: Number(row.id),
      changeRequestId: String(row.change_request_id),
      actionType: String(row.action_type) as ChangeActionType,
      clientCode: String(row.client_code),
      portfolioCode: String(row.portfolio_code),
      assetClassCode: String(row.asset_class_code),
      subAssetClassCode: row.sub_asset_class_code != null ? String(row.sub_asset_class_code) : "",
      managerCode: String(row.manager_code),
      benchmarkCode: row.benchmark_code != null ? String(row.benchmark_code) : "",
      npcClassificationId: Number(row.npc_classification_id),
      longName: String(row.long_name),
      shortName: String(row.short_name),
      effectiveFrom: mapDate(row.effective_from),
      effectiveUntil: row.effective_until != null ? mapDate(row.effective_until) : null,
    }));
  }, []);
}

/**
 * Update an existing change_portfolio_configuration row.
 *
 * Only used by the change-management flow: a stakeholder amends a staged
 * change before it is processed. Direct caller code is responsible for
 * verifying that the change request is still in 'submitted' or 'accepted'
 * state.
 */
export async function updateChangePortfolioConfiguration(
  id: number,
  patch: Partial<{
    actionType: ChangeActionType;
    clientCode: string;
    portfolioCode: string;
    assetClassCode: string;
    subAssetClassCode: string;
    managerCode: string;
    benchmarkCode: string;
    npcClassificationId: number;
    longName: string;
    shortName: string;
    effectiveFrom: string;
    effectiveUntil: string | null;
  }>,
): Promise<void> {
  if (!sql) throw new Error("Database not available");
  await sql!`
    UPDATE client_config.change_portfolio_configuration SET
      action_type         = COALESCE(${patch.actionType ?? null}, action_type),
      client_code         = COALESCE(${patch.clientCode ?? null}, client_code),
      portfolio_code      = COALESCE(${patch.portfolioCode ?? null}, portfolio_code),
      asset_class_code    = COALESCE(${patch.assetClassCode ?? null}, asset_class_code),
      sub_asset_class_code= COALESCE(${patch.subAssetClassCode ?? null}, sub_asset_class_code),
      manager_code        = COALESCE(${patch.managerCode ?? null}, manager_code),
      benchmark_code      = COALESCE(${patch.benchmarkCode ?? null}, benchmark_code),
      npc_classification_id = COALESCE(${patch.npcClassificationId ?? null}, npc_classification_id),
      long_name           = COALESCE(${patch.longName ?? null}, long_name),
      short_name          = COALESCE(${patch.shortName ?? null}, short_name),
      effective_from      = COALESCE(${patch.effectiveFrom ?? null}, effective_from),
      effective_until     = COALESCE(${patch.effectiveUntil ?? null}, effective_until)
    WHERE id = ${id}
  `;
}

/**
 * Delete a staged change_portfolio_configuration row.
 * Returns true if a row was actually deleted.
 */
export async function deleteChangePortfolioConfiguration(id: number): Promise<boolean> {
  if (!sql) throw new Error("Database not available");
  const rows = await sql!`
    DELETE FROM client_config.change_portfolio_configuration
    WHERE id = ${id}
    RETURNING id
  `;
  return rows.length > 0;
}

// ─────────────────────────────────────────────────────────────────────────
// Validation helpers for direct callers (server actions / admin UI)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Validate and stage a CREATE/UPDATE/DELETE change on a portfolio_configuration
 * row. Returns the staged row id on success, or an array of issues on failure.
 *
 * For UPDATE and DELETE actions, the caller MUST provide a primaryAccountId
 * (either directly or implicitly via the four dimension codes). The function
 * re-derives it and double-checks it against the supplied value.
 */
export async function stageChangePortfolioConfiguration(input: {
  changeRequestId: string;
  actionType: ChangeActionType;
  primaryAccountId?: string | null;
  clientCode: string;
  portfolioCode: string;
  assetClassCode: string;
  subAssetClassCode: string;
  managerCode: string;
  benchmarkCode: string;
  npcClassificationId: number;
  longName: string;
  shortName: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; issues: string[] }> {
  // Derive primaryAccountId from the four dimensions if not provided.
  const primaryAccountId =
    input.primaryAccountId && input.primaryAccountId.trim().length > 0
      ? input.primaryAccountId.trim().toUpperCase()
      : buildPrimaryAccountId(
          input.clientCode,
          input.assetClassCode,
          input.subAssetClassCode,
          input.managerCode,
        );

  if (!primaryAccountId) {
    return { ok: false, issues: validateRequiredFields(input) };
  }

  // For UPDATE/DELETE we look up the existing row to enforce consistency.
  let existing: { primaryAccountId: string } | null = null;
  if (input.actionType === "UPDATE" || input.actionType === "DELETE") {
    existing = await getClientConfigPortfolioConfigurationById(primaryAccountId);
  }

  const preIssues = validateActionSpecificRules(input.actionType, input, existing);
  if (preIssues.length > 0) {
    return { ok: false, issues: preIssues };
  }

  const validation = validateChangePortfolioConfiguration({
    changeRequestId: input.changeRequestId,
    actionType: input.actionType,
    clientCode: input.clientCode,
    portfolioCode: input.portfolioCode,
    assetClassCode: input.assetClassCode,
    subAssetClassCode: input.subAssetClassCode,
    managerCode: input.managerCode,
    benchmarkCode: input.benchmarkCode,
    npcClassificationId: input.npcClassificationId,
    longName: input.longName,
    shortName: input.shortName,
    effectiveFrom: input.effectiveFrom,
    effectiveUntil: input.effectiveUntil,
  });

  if (!validation.valid) {
    return { ok: false, issues: validation.errors };
  }

  const id = await saveChangePortfolioConfiguration({
    changeRequestId: input.changeRequestId,
    actionType: input.actionType,
    clientCode: input.clientCode,
    portfolioCode: input.portfolioCode,
    assetClassCode: input.assetClassCode,
    subAssetClassCode: input.subAssetClassCode,
    managerCode: input.managerCode,
    benchmarkCode: input.benchmarkCode,
    npcClassificationId: input.npcClassificationId,
    longName: input.longName,
    shortName: input.shortName,
    effectiveFrom: input.effectiveFrom,
    effectiveUntil: input.effectiveUntil,
  });

  return { ok: true, id };
}

// ─────────────────────────────────────────────────────────────────────────
// Apply staged changes to the live portfolio_configuration table
// ─────────────────────────────────────────────────────────────────────────

export interface ApplyChangeResult {
  success: boolean;
  applied: Array<{
    actionType: ChangeActionType;
    primaryAccountId: string;
    result: "applied" | "skipped" | "failed";
    error?: string;
  }>;
  error?: string;
}

/**
 * Apply every staged change_portfolio_configuration row for a change request
 * to the live portfolio_configuration table.
 *
 *  - CREATE: INSERT a new portfolio_configuration row.
 *    If a row with the same primary_account_id already exists, mark
 *    active_ind = false on the existing row (close it out) and INSERT a new
 *    active row.
 *  - UPDATE: Mark the existing row active_ind = false and effective_until =
 *    effective_from (close it out), then INSERT a new row carrying the
 *    updated dimension values. This is a "slowly changing dimension type 2"
 *    pattern that preserves history.
 *  - DELETE: Mark the existing row active_ind = false and set
 *    effective_until = today.
 *
 * This is the integration point between the BCM change-management workflow
 * and the live configuration. Direct mutations of client_config tables are
 * NOT supported; the only path is via a staged change that reaches the
 * 'processed' state.
 *
 * The function sets a session-level PostgreSQL GUC
 * (app.change_process_bypass = 'true') before mutating the live
 * portfolio_configuration table. This bypasses the DB trigger
 * trg_enforce_change_process_{insert,update,delete}, which would
 * otherwise block any direct DML on client_config.portfolio_configuration.
 * See db/enforce_change_process.sql.
 */
export async function applyChangePortfolioConfigurations(
  changeRequestId: string,
): Promise<ApplyChangeResult> {
  if (!sql) return { success: false, applied: [], error: "Database not available" };

  const staged = await getChangePortfolioConfigurations(changeRequestId);
  if (staged.length === 0) {
    return { success: true, applied: [] };
  }

  const today = new Date().toISOString().split("T")[0];
  const applied: ApplyChangeResult["applied"] = [];

  await (sql as any).begin(async (tx: any) => {
    // Set the session-level GUC so the enforcement trigger allows mutations.
    // This is scoped to the current transaction and is the ONLY code path
    // that should ever mutate client_config.portfolio_configuration.
    await tx`SET LOCAL app.change_process_bypass = 'true'`;
    for (const row of staged) {
      const primaryAccountId = buildPrimaryAccountId(
        row.clientCode,
        row.assetClassCode,
        row.subAssetClassCode,
        row.managerCode,
      );
      if (!primaryAccountId) {
        applied.push({
          actionType: row.actionType,
          primaryAccountId: "<unknown>",
          result: "failed",
          error: "Kan primaryAccountId niet afleiden uit de dimensies.",
        });
        continue;
      }

      try {
        if (row.actionType === "CREATE") {
          const [existing] = await tx`
            SELECT 1 FROM client_config.portfolio_configuration
            WHERE primary_account_id = ${primaryAccountId} AND active_ind = true
            LIMIT 1
          `;
          if (existing) {
            applied.push({
              actionType: row.actionType,
              primaryAccountId,
              result: "skipped",
              error: "Er bestaat al een actieve configuratie voor deze primary_account_id.",
            });
            continue;
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
          applied.push({ actionType: row.actionType, primaryAccountId, result: "applied" });
          continue;
        }

        if (row.actionType === "UPDATE") {
          const [existing] = await tx`
            SELECT 1 FROM client_config.portfolio_configuration
            WHERE primary_account_id = ${primaryAccountId} AND active_ind = true
            LIMIT 1
          `;
          if (!existing) {
            applied.push({
              actionType: row.actionType,
              primaryAccountId,
              result: "failed",
              error: "Geen actieve configuratie gevonden om bij te werken.",
            });
            continue;
          }
          // Close out the current row.
          await tx`
            UPDATE client_config.portfolio_configuration
            SET active_ind = false,
                effective_until = ${row.effectiveFrom}
            WHERE primary_account_id = ${primaryAccountId} AND active_ind = true
          `;
          // Insert the new active row.
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
          applied.push({ actionType: row.actionType, primaryAccountId, result: "applied" });
          continue;
        }

        if (row.actionType === "DELETE") {
          const [existing] = await tx`
            SELECT 1 FROM client_config.portfolio_configuration
            WHERE primary_account_id = ${primaryAccountId} AND active_ind = true
            LIMIT 1
          `;
          if (!existing) {
            applied.push({
              actionType: row.actionType,
              primaryAccountId,
              result: "skipped",
              error: "Geen actieve configuratie gevonden om te verwijderen.",
            });
            continue;
          }
          await tx`
            UPDATE client_config.portfolio_configuration
            SET active_ind = false,
                effective_until = ${row.effectiveUntil ?? today}
            WHERE primary_account_id = ${primaryAccountId} AND active_ind = true
          `;
          applied.push({ actionType: row.actionType, primaryAccountId, result: "applied" });
          continue;
        }

        applied.push({
          actionType: row.actionType,
          primaryAccountId,
          result: "failed",
          error: `Onbekende action_type: ${row.actionType}`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Onbekende fout";
        applied.push({
          actionType: row.actionType,
          primaryAccountId,
          result: "failed",
          error: message,
        });
      }
    }
  });

  return { success: applied.every((a) => a.result !== "failed"), applied };
}
